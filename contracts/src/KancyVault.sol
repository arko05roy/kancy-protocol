// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {ManagerStatus, IManagerRegistry, IEpochSettler} from "./interfaces/IKancy.sol";

/// @title KancyVault
/// @notice One per Curator. ERC-4626-style shares over USDC. Deposits mint at the last settled NAV and sit idle until
///         the next settlement; withdrawals are queued and priced at the settlement NAV (PRD §6.5, §7.2).
/// @dev Shares are the ERC20 itself (6 decimals). Curator has no transfer rights over assets.
contract KancyVault is ERC20 {
    using SafeTransferLib for ERC20;

    error NotCurator();
    error NotSettler();
    error ZeroAmount();
    error NotActiveManager();
    error AlreadyAdded();
    error NotListed();
    error TooManyManagers();
    error BadConfig();
    error NothingToClaim();
    error PendingUnclaimed();
    error LengthMismatch();

    event Deposit(address indexed user, uint256 assets, uint256 shares);
    event WithdrawRequested(address indexed user, uint64 indexed epoch, uint256 shares);
    event WithdrawCancelled(address indexed user, uint64 indexed epoch, uint256 shares);
    event Claimed(address indexed user, uint64 indexed epoch, uint256 shares, uint256 assets);
    event ManagerAdded(address indexed manager);
    event ManagerRemoved(address indexed manager);
    event TargetSet(address indexed manager, uint256 amount);
    event ConfigQueued(uint16 curatorCutBps, uint16 minRatioBps, uint256 maxAllocation, uint64 effectiveEpoch);
    event VaultSettled(uint64 indexed epoch, uint256 nav, uint256 supply, uint256 withdrawShares, uint256 withdrawAssets);

    struct Config {
        uint16 curatorCutBps; // share of the Manager performance fee, 0..5000
        uint16 minRatioBps; // min First-loss Ratio: stake / allocation
        uint256 maxAllocation;
    }

    struct Request {
        uint64 epoch;
        uint256 shares;
    }

    uint256 public constant MAX_MANAGERS = 10;

    ERC20 public immutable asset;
    IManagerRegistry public immutable registry;
    address public immutable settler;
    address public immutable book;
    address public immutable curator;
    string public metadataURI;

    Config internal _cfg;
    Config internal _pendingCfg;
    uint64 public pendingCfgEpoch;
    bool public hasPendingCfg;

    address[] internal _managers;
    mapping(address => bool) public isManager;
    mapping(address => bool) public removing;
    mapping(address => uint256) public target;

    uint256 public claimReserve;
    mapping(address => Request) public requests;
    mapping(uint64 => uint256) public epochWithdrawShares;
    mapping(uint64 => uint256) public epochWithdrawAssets;

    constructor(
        ERC20 _asset,
        IManagerRegistry _registry,
        address _settler,
        address _book,
        address _curator,
        string memory _name,
        string memory _metadataURI,
        Config memory cfg
    ) ERC20(_name, "kVLT", 6) {
        _checkCfg(cfg);
        asset = _asset;
        registry = _registry;
        settler = _settler;
        book = _book;
        curator = _curator;
        metadataURI = _metadataURI;
        _cfg = cfg;
    }

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    // ---------------------------------------------------------------- views

    function curatorCutBps() external view returns (uint256) {
        return _cfg.curatorCutBps;
    }

    function minRatioBps() external view returns (uint256) {
        return _cfg.minRatioBps;
    }

    function maxAllocation() external view returns (uint256) {
        return _cfg.maxAllocation;
    }

    function config() external view returns (Config memory active, Config memory pending, uint64 pendingEpoch) {
        return (_cfg, _pendingCfg, hasPendingCfg ? pendingCfgEpoch : 0);
    }

    function managers() external view returns (address[] memory) {
        return _managers;
    }

    function idle() public view returns (uint256) {
        return asset.balanceOf(address(this)) - claimReserve;
    }

    function allocated() public view returns (uint256 t) {
        for (uint256 i; i < _managers.length; i++) {
            t += registry.allocation(_managers[i], address(this));
        }
    }

    /// @notice NAV = idle USDC + Σ allocations (as last settled). Never moves with the live pool.
    function nav() public view returns (uint256) {
        return idle() + allocated();
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return assets * (totalSupply + 1) / (nav() + 1);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares * (nav() + 1) / (totalSupply + 1);
    }

    function _epoch() internal view returns (uint64) {
        return IEpochSettler(settler).currentEpoch();
    }

    // ---------------------------------------------------------------- depositor

    function deposit(uint256 assets) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        shares = convertToShares(assets); // rounds down (toward the vault)
        if (shares == 0) revert ZeroAmount();
        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, assets, shares);
    }

    /// @notice Escrow shares until the current Epoch settles. Queued shares still carry this Epoch's P&L.
    function requestWithdraw(uint256 shares) external {
        if (shares == 0) revert ZeroAmount();
        uint64 e = _epoch();
        Request storage r = requests[msg.sender];
        if (r.shares > 0 && r.epoch != e) {
            if (r.epoch < e) _claim(msg.sender);
            else revert PendingUnclaimed();
        }
        _move(msg.sender, address(this), shares);
        r.epoch = e;
        r.shares += shares;
        epochWithdrawShares[e] += shares;
        emit WithdrawRequested(msg.sender, e, shares);
    }

    function cancelWithdraw() external {
        Request storage r = requests[msg.sender];
        uint64 e = _epoch();
        if (r.shares == 0 || r.epoch != e) revert NothingToClaim();
        uint256 s = r.shares;
        r.shares = 0;
        epochWithdrawShares[e] -= s;
        _move(address(this), msg.sender, s);
        emit WithdrawCancelled(msg.sender, e, s);
    }

    function claim() external returns (uint256) {
        return _claim(msg.sender);
    }

    function claimable(address user) external view returns (uint256) {
        Request memory r = requests[user];
        if (r.shares == 0 || r.epoch >= _epoch()) return 0;
        return r.shares * epochWithdrawAssets[r.epoch] / epochWithdrawShares[r.epoch];
    }

    function _claim(address user) internal returns (uint256 assets) {
        Request storage r = requests[user];
        if (r.shares == 0 || r.epoch >= _epoch()) revert NothingToClaim();
        assets = r.shares * epochWithdrawAssets[r.epoch] / epochWithdrawShares[r.epoch];
        emit Claimed(user, r.epoch, r.shares, assets);
        r.shares = 0;
        claimReserve -= assets;
        asset.safeTransfer(user, assets);
    }

    function _move(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    // ---------------------------------------------------------------- curator

    function addManager(address m) external onlyCurator {
        if (isManager[m]) {
            if (!removing[m]) revert AlreadyAdded();
            removing[m] = false;
            emit ManagerAdded(m);
            return;
        }
        if (registry.status(m) != ManagerStatus.Active) revert NotActiveManager();
        if (_managers.length >= MAX_MANAGERS) revert TooManyManagers();
        isManager[m] = true;
        _managers.push(m);
        emit ManagerAdded(m);
    }

    /// @notice Takes effect at the next settlement; capital comes back as idle.
    function removeManager(address m) external onlyCurator {
        if (!isManager[m]) revert NotListed();
        removing[m] = true;
        target[m] = 0;
        emit ManagerRemoved(m);
    }

    function setTargets(address[] calldata ms, uint256[] calldata amounts) external onlyCurator {
        if (ms.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < ms.length; i++) {
            if (!isManager[ms[i]] || removing[ms[i]]) revert NotListed();
            target[ms[i]] = amounts[i];
            emit TargetSet(ms[i], amounts[i]);
        }
    }

    /// @notice Fee/limit changes apply after 1 full Epoch so Depositors are warned (PRD §7.5).
    function queueConfig(Config calldata cfg) external onlyCurator {
        _checkCfg(cfg);
        _pendingCfg = cfg;
        pendingCfgEpoch = _epoch() + 1;
        hasPendingCfg = true;
        emit ConfigQueued(cfg.curatorCutBps, cfg.minRatioBps, cfg.maxAllocation, pendingCfgEpoch);
    }

    function _checkCfg(Config memory cfg) internal pure {
        if (cfg.curatorCutBps > 5000 || cfg.minRatioBps == 0 || cfg.minRatioBps > 10_000) revert BadConfig();
    }

    // ---------------------------------------------------------------- settler

    /// @notice Called after manager P&L has been written to allocations. Processes the queue against the new NAV and
    ///         returns the new allocation per manager. The settler moves the money.
    function settle() external onlySettler returns (address[] memory mgrs, uint256[] memory targets) {
        uint64 e = _epoch();
        if (hasPendingCfg && e >= pendingCfgEpoch) {
            _cfg = _pendingCfg;
            hasPendingCfg = false;
        }
        _compact();

        uint256 navNow = nav();
        uint256 supply = totalSupply;
        uint256 wShares = epochWithdrawShares[e];
        uint256 wAssets;
        if (wShares > 0) {
            wAssets = wShares * navNow / supply; // round down
            epochWithdrawAssets[e] = wAssets;
            _burn(address(this), wShares);
            claimReserve += wAssets;
        }
        emit VaultSettled(e, navNow, supply, wShares, wAssets);

        uint256 available = navNow - wAssets;
        uint256 n = _managers.length;
        mgrs = _managers;
        targets = new uint256[](n);
        uint256 sum;
        for (uint256 i; i < n; i++) {
            targets[i] = _cappedTarget(mgrs[i]);
            sum += targets[i];
        }
        if (sum > available) {
            for (uint256 i; i < n; i++) {
                targets[i] = targets[i] * available / sum;
            }
        }
    }

    function _cappedTarget(address m) internal view returns (uint256 t) {
        ManagerStatus s = registry.status(m);
        uint256 cur = registry.allocation(m, address(this));
        if (removing[m] || s == ManagerStatus.Paused || s == ManagerStatus.None || s == ManagerStatus.SelfOnly) {
            return 0;
        }
        t = target[m];
        if (s == ManagerStatus.Grace && t > cur) t = cur; // no new allocations in Grace
        if (t > _cfg.maxAllocation) t = _cfg.maxAllocation;
        uint256 stakeCap = registry.stake(m) * 10_000 / _cfg.minRatioBps;
        if (t > stakeCap) t = stakeCap;
    }

    /// @dev Drop removed managers whose capital is fully back.
    function _compact() internal {
        uint256 i;
        while (i < _managers.length) {
            address m = _managers[i];
            if (removing[m] && registry.allocation(m, address(this)) == 0) {
                _managers[i] = _managers[_managers.length - 1];
                _managers.pop();
                isManager[m] = false;
                removing[m] = false;
            } else {
                i++;
            }
        }
    }

    function pushToBook(uint256 amount) external onlySettler {
        asset.safeTransfer(book, amount);
    }
}

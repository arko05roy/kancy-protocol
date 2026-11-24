// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {ManagerStatus, IEpochSettler} from "./interfaces/IKancy.sol";

/// @title ManagerRegistry
/// @notice Manager registration, stake bookkeeping, status, allocations and rebalance limits.
/// @dev Stake *tokens* live in PositionBook once settled; only not-yet-settled top-ups sit here (`pendingStake`).
///      Accounting fields (stake, allocation, status) are written only by the EpochSettler.
contract ManagerRegistry {
    using SafeTransferLib for ERC20;

    error NotOwner();
    error NotSettler();
    error NotBook();
    error AlreadyWired();
    error AlreadyRegistered();
    error NotRegistered();
    error StakeTooLow();
    error BadTicks();
    error TooManyManagers();
    error RebalanceLimit();
    error CannotRebalance();

    event Registered(address indexed manager, uint256 stake, int24 tickLower, int24 tickUpper, string metadataURI);
    event StakeToppedUp(address indexed manager, uint256 amount);
    event StakeWithdrawRequested(address indexed manager, uint256 amount);
    event StakeSet(address indexed manager, uint256 stake);
    event StatusChanged(address indexed manager, ManagerStatus status);
    event AllocationSet(address indexed manager, address indexed vault, uint256 amount);
    event RangeSet(address indexed manager, int24 tickLower, int24 tickUpper, uint64 epoch, uint32 count);
    event ParamsSet(uint256 minStake, uint32 maxRebalancesPerEpoch);

    int24 public constant TICK_SPACING = 60;
    uint256 public constant MAX_MANAGERS = 20;

    struct Manager {
        ManagerStatus status;
        int24 tickLower;
        int24 tickUpper;
        uint32 rebalanceCount;
        uint64 rebalanceEpoch;
        uint256 stake;
        uint256 pendingStake;
        uint256 stakeWithdrawRequest;
        string metadataURI;
    }

    ERC20 public immutable usdc;
    address public immutable owner;
    address public settler;
    address public book;

    uint256 public minStake;
    uint32 public maxRebalancesPerEpoch;

    mapping(address => Manager) internal _m;
    address[] internal _managers;
    mapping(address => bool) public listed;

    mapping(address => mapping(address => uint256)) public allocation;
    mapping(address => address[]) internal _vaultsOf;
    mapping(address => mapping(address => bool)) internal _hasVault;

    constructor(ERC20 _usdc, uint256 _minStake, uint32 _maxRebalances) {
        usdc = _usdc;
        owner = msg.sender;
        minStake = _minStake;
        maxRebalancesPerEpoch = _maxRebalances;
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    function wire(address _settler, address _book) external {
        if (msg.sender != owner) revert NotOwner();
        if (settler != address(0)) revert AlreadyWired();
        settler = _settler;
        book = _book;
    }

    function setParams(uint256 _minStake, uint32 _maxRebalances) external {
        if (msg.sender != owner) revert NotOwner();
        minStake = _minStake;
        maxRebalancesPerEpoch = _maxRebalances;
        emit ParamsSet(_minStake, _maxRebalances);
    }

    // ---------------------------------------------------------------- manager actions

    /// @notice Register (or re-register after Paused) with a stake and an initial range.
    function register(string calldata metadataURI, uint256 stakeAmount, int24 tickLower, int24 tickUpper) external {
        Manager storage m = _m[msg.sender];
        if (m.status != ManagerStatus.None && !(m.status == ManagerStatus.Paused && m.stake == 0)) {
            revert AlreadyRegistered();
        }
        if (stakeAmount < minStake) revert StakeTooLow();
        _checkTicks(tickLower, tickUpper);
        if (!listed[msg.sender]) {
            if (_managers.length >= MAX_MANAGERS) revert TooManyManagers();
            listed[msg.sender] = true;
            _managers.push(msg.sender);
        }
        m.status = ManagerStatus.SelfOnly;
        m.tickLower = tickLower;
        m.tickUpper = tickUpper;
        m.metadataURI = metadataURI;
        m.pendingStake += stakeAmount;
        usdc.safeTransferFrom(msg.sender, address(this), stakeAmount);
        emit Registered(msg.sender, stakeAmount, tickLower, tickUpper, metadataURI);
        emit StatusChanged(msg.sender, ManagerStatus.SelfOnly);
    }

    /// @notice Top-ups join the stake at the next settlement (they never change the running Epoch's capital).
    function topUpStake(uint256 amount) external {
        ManagerStatus s = _m[msg.sender].status;
        if (s == ManagerStatus.None || s == ManagerStatus.Paused) revert NotRegistered();
        _m[msg.sender].pendingStake += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit StakeToppedUp(msg.sender, amount);
    }

    /// @notice Paid at settlement, capped at stake − requiredStake (PRD §7.6). Overwrites any earlier request.
    function requestStakeWithdraw(uint256 amount) external {
        if (_m[msg.sender].status == ManagerStatus.None) revert NotRegistered();
        _m[msg.sender].stakeWithdrawRequest = amount;
        emit StakeWithdrawRequested(msg.sender, amount);
    }

    // ---------------------------------------------------------------- book hook

    function onRebalance(address manager, int24 tickLower, int24 tickUpper) external {
        if (msg.sender != book) revert NotBook();
        Manager storage m = _m[manager];
        ManagerStatus s = m.status;
        if (s != ManagerStatus.SelfOnly && s != ManagerStatus.Active && s != ManagerStatus.Grace) {
            revert CannotRebalance();
        }
        _checkTicks(tickLower, tickUpper);
        uint64 e = IEpochSettler(settler).currentEpoch();
        if (m.rebalanceEpoch != e) {
            m.rebalanceEpoch = e;
            m.rebalanceCount = 0;
        }
        if (m.rebalanceCount >= maxRebalancesPerEpoch) revert RebalanceLimit();
        m.rebalanceCount++;
        m.tickLower = tickLower;
        m.tickUpper = tickUpper;
        emit RangeSet(manager, tickLower, tickUpper, e, m.rebalanceCount);
    }

    // ---------------------------------------------------------------- settler writes

    function takePendingStake(address manager) external onlySettler returns (uint256 amt) {
        amt = _m[manager].pendingStake;
        if (amt == 0) return 0;
        _m[manager].pendingStake = 0;
        usdc.safeTransfer(book, amt);
    }

    function setStake(address manager, uint256 s) external onlySettler {
        _m[manager].stake = s;
        emit StakeSet(manager, s);
    }

    function setStatus(address manager, ManagerStatus s) external onlySettler {
        if (_m[manager].status == s) return;
        _m[manager].status = s;
        emit StatusChanged(manager, s);
    }

    function setAllocation(address manager, address vault, uint256 a) external onlySettler {
        if (!_hasVault[manager][vault]) {
            _hasVault[manager][vault] = true;
            _vaultsOf[manager].push(vault);
        }
        allocation[manager][vault] = a;
        emit AllocationSet(manager, vault, a);
    }

    function clearStakeWithdrawRequest(address manager) external onlySettler {
        _m[manager].stakeWithdrawRequest = 0;
    }

    // ---------------------------------------------------------------- views

    function status(address manager) external view returns (ManagerStatus) {
        return _m[manager].status;
    }

    function stake(address manager) external view returns (uint256) {
        return _m[manager].stake;
    }

    function pendingStake(address manager) external view returns (uint256) {
        return _m[manager].pendingStake;
    }

    function stakeWithdrawRequest(address manager) external view returns (uint256) {
        return _m[manager].stakeWithdrawRequest;
    }

    function ticks(address manager) external view returns (int24, int24) {
        return (_m[manager].tickLower, _m[manager].tickUpper);
    }

    function getManager(address manager) external view returns (Manager memory) {
        return _m[manager];
    }

    function managers() external view returns (address[] memory) {
        return _managers;
    }

    function vaultsOf(address manager) external view returns (address[] memory) {
        return _vaultsOf[manager];
    }

    function totalAllocation(address manager) public view returns (uint256 t) {
        address[] storage vs = _vaultsOf[manager];
        for (uint256 i; i < vs.length; i++) {
            t += allocation[manager][vs[i]];
        }
    }

    /// @notice C_m = S_m + A_m.
    function capital(address manager) external view returns (uint256) {
        return _m[manager].stake + totalAllocation(manager);
    }

    function _checkTicks(int24 lo, int24 hi) internal pure {
        if (
            lo >= hi || lo % TICK_SPACING != 0 || hi % TICK_SPACING != 0 || lo < TickMath.MIN_TICK
                || hi > TickMath.MAX_TICK
        ) revert BadTicks();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {
    ManagerStatus,
    IManagerRegistry,
    IPositionBook,
    IKancyVault,
    IOracleAdapter,
    IVaultFactory
} from "./interfaces/IKancy.sol";

/// @title EpochSettler
/// @notice Permissionless `settleEpoch()`: oracle valuation -> loss waterfall / fees -> statuses -> withdrawal queues
///         -> reallocation -> stake withdrawals -> reopen positions -> keeper bounty (PRD §7.1).
contract EpochSettler {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    error NotOwner();
    error AlreadyWired();
    error EpochNotOver(uint256 endsAt);
    error BadParam();

    event EpochSettled(uint64 indexed epoch, uint256 price, uint256 startedAt, uint256 settledAt, address keeper);
    event ManagerSettled(
        address indexed manager,
        uint64 indexed epoch,
        uint256 capitalStart, // C_m
        uint256 valueEnd, // V_m
        int256 pnl,
        uint256 performanceFee,
        uint256 curatorFees,
        uint256 fromStake,
        uint256 fromBackers,
        uint256 stakeAfter,
        uint256 allocatedAfter
    );
    event VaultManagerPnl(address indexed vault, address indexed manager, uint64 indexed epoch, int256 pnl);
    event StakeWithdrawn(address indexed manager, uint256 amount);
    event ParamsSet(uint256 epochLength, uint256 performanceFeeBps, uint256 keeperBounty);

    IManagerRegistry public immutable registry;
    IPositionBook public immutable book;
    IOracleAdapter public immutable oracle;
    ERC20 public immutable usdc;
    address public immutable owner;
    IVaultFactory public factory;

    uint64 public currentEpoch;
    uint256 public epochStart;
    uint256 public epochLength;
    uint256 public performanceFeeBps;
    uint256 public keeperBounty;

    constructor(
        IManagerRegistry _registry,
        IPositionBook _book,
        IOracleAdapter _oracle,
        ERC20 _usdc,
        uint256 _epochLength,
        uint256 _performanceFeeBps,
        uint256 _keeperBounty
    ) {
        registry = _registry;
        book = _book;
        oracle = _oracle;
        usdc = _usdc;
        owner = msg.sender;
        _setParams(_epochLength, _performanceFeeBps, _keeperBounty);
        currentEpoch = 1;
        epochStart = block.timestamp;
    }

    function wire(IVaultFactory _factory) external {
        if (msg.sender != owner) revert NotOwner();
        if (address(factory) != address(0)) revert AlreadyWired();
        factory = _factory;
    }

    function setParams(uint256 _epochLength, uint256 _performanceFeeBps, uint256 _keeperBounty) external {
        if (msg.sender != owner) revert NotOwner();
        _setParams(_epochLength, _performanceFeeBps, _keeperBounty);
    }

    function _setParams(uint256 l, uint256 f, uint256 b) internal {
        if (l == 0 || f > 5000) revert BadParam();
        epochLength = l;
        performanceFeeBps = f;
        keeperBounty = b;
        emit ParamsSet(l, f, b);
    }

    function epochEndsAt() public view returns (uint256) {
        return epochStart + epochLength;
    }

    // ---------------------------------------------------------------- settlement

    function settleEpoch() external {
        if (block.timestamp < epochEndsAt()) revert EpochNotOver(epochEndsAt());
        uint256 p = oracle.price();
        oracle.checkPool(book.poolSqrtPrice());

        address[] memory ms = registry.managers();
        // 1-3. value, waterfall, fees, pending stake, statuses
        for (uint256 i; i < ms.length; i++) {
            _settleManager(ms[i], p);
        }
        // 4-5. withdrawal queues, reallocation
        address[] memory vs = factory.allVaults();
        for (uint256 i; i < vs.length; i++) {
            _settleVault(vs[i], p);
        }
        // stake withdrawals, paused close-outs, reopen
        for (uint256 i; i < ms.length; i++) {
            _finishManager(ms[i], p);
        }

        // 6. advance, pay keeper
        emit EpochSettled(currentEpoch, p, epochStart, block.timestamp, msg.sender);
        currentEpoch++;
        epochStart = block.timestamp;
        uint256 bounty = keeperBounty;
        if (bounty > 0 && usdc.balanceOf(address(this)) >= bounty) usdc.safeTransfer(msg.sender, bounty);
    }

    struct Ctx {
        uint256 S;
        uint256 A;
        uint256 C;
        uint256 V;
        uint256 fee;
        uint256 curatorPaid;
        uint256 fromStake;
        uint256 fromBackers;
        uint256 newA;
    }

    function _settleManager(address m, uint256 p) internal {
        ManagerStatus st = registry.status(m);
        if (st == ManagerStatus.None) return;

        book.closePosition(m);

        Ctx memory c;
        c.S = registry.stake(m);
        address[] memory vs = registry.vaultsOf(m);
        uint256[] memory a = new uint256[](vs.length);
        for (uint256 i; i < vs.length; i++) {
            a[i] = registry.allocation(m, vs[i]);
            c.A += a[i];
        }
        c.C = c.S + c.A;
        c.V = book.value(m, p);

        if (c.C > 0) {
            if (c.V >= c.C) _profit(m, p, c, vs, a);
            else _loss(m, c, vs, a);
        } else {
            c.newA = 0;
        }

        // stake = what's left after backers' claims and paid curator fees (absorbs rounding dust)
        uint256 claims = c.newA + c.curatorPaid;
        uint256 newS = c.C == 0 ? c.S : (c.V > claims ? c.V - claims : 0);

        uint256 pend = registry.takePendingStake(m);
        if (pend > 0) {
            book.credit(m, pend);
            newS += pend;
        }
        registry.setStake(m, newS);

        _updateStatus(m, st, newS, c.C);

        emit ManagerSettled(
            m,
            currentEpoch,
            c.C,
            c.V,
            int256(c.V) - int256(c.C),
            c.fee,
            c.curatorPaid,
            c.fromStake,
            c.fromBackers,
            newS,
            c.newA
        );
    }

    /// @dev PRD §6.3. Fee charged only on the backed share; curator takes `cut` of the fee for its slice.
    function _profit(address m, uint256 p, Ctx memory c, address[] memory vs, uint256[] memory a) internal {
        uint256 pnl = c.V - c.C;
        if (c.A == 0) return;
        uint256 backedPnl = pnl * c.A / c.C;
        c.fee = backedPnl * performanceFeeBps / 10_000;
        uint256 toBackers = backedPnl - c.fee;
        for (uint256 i; i < vs.length; i++) {
            if (a[i] == 0) continue;
            uint256 gain = toBackers * a[i] / c.A;
            uint256 newA = a[i] + gain;
            registry.setAllocation(m, vs[i], newA);
            c.newA += newA;
            emit VaultManagerPnl(vs[i], m, currentEpoch, int256(gain));

            uint256 cut = c.fee * a[i] / c.A * IKancyVault(vs[i]).curatorCutBps() / 10_000;
            if (cut > 0) c.curatorPaid += book.payout(m, cut, IKancyVault(vs[i]).curator(), p);
        }
    }

    /// @dev PRD §6.4 waterfall. Backer losses rounded up so the stake (never the vault) gets the rounding dust.
    function _loss(address m, Ctx memory c, address[] memory vs, uint256[] memory a) internal {
        uint256 L = c.C - c.V;
        c.fromStake = L < c.S ? L : c.S;
        c.fromBackers = L - c.fromStake;
        for (uint256 i; i < vs.length; i++) {
            if (a[i] == 0) continue;
            uint256 hit = c.fromBackers == 0 ? 0 : c.fromBackers.mulDivUp(a[i], c.A);
            if (hit > a[i]) hit = a[i];
            uint256 newA = a[i] - hit;
            if (hit > 0) registry.setAllocation(m, vs[i], newA);
            c.newA += newA;
            emit VaultManagerPnl(vs[i], m, currentEpoch, -int256(hit));
        }
    }

    function _updateStatus(address m, ManagerStatus st, uint256 S, uint256 C) internal {
        if (st == ManagerStatus.SelfOnly) {
            if (C == 0) return; // first position opens at this settlement
            // completed one Self-only Epoch; a shortfall gets the same 1-Epoch Grace as everyone else (D8)
            registry.setStatus(m, S >= requiredStake(m) ? ManagerStatus.Active : ManagerStatus.Grace);
        } else if (st == ManagerStatus.Active) {
            if (S < requiredStake(m)) registry.setStatus(m, ManagerStatus.Grace);
        } else if (st == ManagerStatus.Grace) {
            registry.setStatus(m, S >= requiredStake(m) ? ManagerStatus.Active : ManagerStatus.Paused);
        }
    }

    /// @notice requiredStake_m = max(minStake, max_v minRatio_v × a_{v,m}) (PRD §7.4).
    function requiredStake(address m) public view returns (uint256 r) {
        r = registry.minStake();
        address[] memory vs = registry.vaultsOf(m);
        for (uint256 i; i < vs.length; i++) {
            uint256 need = registry.allocation(m, vs[i]) * IKancyVault(vs[i]).minRatioBps() / 10_000;
            if (need > r) r = need;
        }
    }

    function _settleVault(address v, uint256 p) internal {
        (address[] memory ms, uint256[] memory ts) = IKancyVault(v).settle();
        // pull capital back first, so the vault's cash covers queued withdrawals and new allocations
        for (uint256 i; i < ms.length; i++) {
            uint256 cur = registry.allocation(ms[i], v);
            if (ts[i] < cur) {
                uint256 paid = book.payout(ms[i], cur - ts[i], v, p);
                registry.setAllocation(ms[i], v, cur - paid);
            }
        }
        for (uint256 i; i < ms.length; i++) {
            uint256 cur = registry.allocation(ms[i], v);
            if (ts[i] > cur) {
                uint256 d = ts[i] - cur;
                IKancyVault(v).pushToBook(d);
                book.credit(ms[i], d);
                registry.setAllocation(ms[i], v, ts[i]);
            }
        }
    }

    function _finishManager(address m, uint256 p) internal {
        ManagerStatus st = registry.status(m);
        if (st == ManagerStatus.None) return;
        if (st == ManagerStatus.Paused) {
            // close out once every vault has been repaid; position stays closed
            if (registry.totalAllocation(m) == 0 && book.value(m, p) > 0) {
                book.sweep(m, m);
                registry.setStake(m, 0);
                registry.clearStakeWithdrawRequest(m);
            }
            return;
        }
        uint256 req = registry.stakeWithdrawRequest(m);
        if (req > 0) {
            uint256 S = registry.stake(m);
            uint256 r = requiredStake(m);
            uint256 avail = S > r ? S - r : 0;
            uint256 amt = req < avail ? req : avail;
            if (amt > 0) {
                uint256 paid = book.payout(m, amt, m, p);
                registry.setStake(m, S - paid);
                emit StakeWithdrawn(m, paid);
            }
            registry.clearStakeWithdrawRequest(m);
        }
        book.openPosition(m);
    }
}

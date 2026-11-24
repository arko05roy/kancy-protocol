// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IManagerRegistry, IOracleAdapter} from "./interfaces/IKancy.sol";

/// @title PositionBook
/// @notice Owns every Kancy v4 position. Each Manager has one range (salt = manager address) plus token inventory.
/// Calls PoolManager directly so that KancyHook sees `sender == PositionBook`.
/// Tokens only ever leave via `payout` / `sweep`, which only the EpochSettler can call (Promise 1).
contract PositionBook is IUnlockCallback {
    using SafeTransferLib for ERC20;
    using StateLibrary for IPoolManager;

    error NotOwner();
    error NotSettler();
    error NotPoolManager();
    error AlreadyWired();
    error InsufficientInventory();

    event Rebalanced(
        address indexed manager, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 weth, uint256 usdc
    );
    event PositionClosed(address indexed manager, uint256 weth, uint256 usdc);
    event PositionOpened(address indexed manager, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event Credited(address indexed manager, uint256 usdc);
    event Paid(address indexed manager, address indexed to, uint256 usdc);
    event Swept(address indexed manager, address indexed to, uint256 weth, uint256 usdc);
    event BaseSeeded(int24 tickLower, int24 tickUpper, uint128 liquidity);

    enum Op {
        Rebalance,
        Close,
        Open,
        Swap,
        AddBase
    }

    struct Book {
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
        uint256 weth;
        uint256 usdc;
    }

    /// @dev Protocol-owned depth so settlement/rebalance swaps have something to trade against. Not anyone's capital.
    address public constant BASE = address(0);

    IPoolManager public immutable poolManager;
    IOracleAdapter public immutable oracle;
    IManagerRegistry public immutable registry;
    address public immutable owner;
    ERC20 public immutable weth;
    ERC20 public immutable usdc;
    bool public immutable wethIs0;

    PoolKey internal _key;
    address public settler;
    mapping(address => Book) public books;

    constructor(
        IPoolManager _pm,
        PoolKey memory key,
        IOracleAdapter _oracle,
        IManagerRegistry _registry,
        ERC20 _weth,
        ERC20 _usdc
    ) {
        poolManager = _pm;
        _key = key;
        oracle = _oracle;
        registry = _registry;
        owner = msg.sender;
        weth = _weth;
        usdc = _usdc;
        wethIs0 = Currency.unwrap(key.currency0) == address(_weth);
    }

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    function wire(address _settler) external {
        if (msg.sender != owner) revert NotOwner();
        if (settler != address(0)) revert AlreadyWired();
        settler = _settler;
    }

    function poolKey() external view returns (PoolKey memory) {
        return _key;
    }

    function poolSqrtPrice() public view returns (uint160 s) {
        (s,,,) = poolManager.getSlot0(_key.toId());
    }

    // ---------------------------------------------------------------- manager

    /// @notice Remove the caller's liquidity, optionally swap inside the pool, re-add max liquidity at the new range.
    /// @param sellWeth swap direction (true: WETH -> USDC).
    /// @param amountIn exact input of the sold token (0 = no swap). Price is limited to oracle ± maxDeviation.
    function rebalance(int24 tickLower, int24 tickUpper, bool sellWeth, uint256 amountIn) external {
        registry.onRebalance(msg.sender, tickLower, tickUpper);
        uint256 p = oracle.price();
        poolManager.unlock(abi.encode(Op.Rebalance, msg.sender, abi.encode(tickLower, tickUpper, sellWeth, amountIn, p)));
        Book storage b = books[msg.sender];
        emit Rebalanced(msg.sender, tickLower, tickUpper, b.liquidity, b.weth, b.usdc);
    }

    // ---------------------------------------------------------------- owner

    /// @notice Seed protocol-owned base liquidity (testnet depth). Tokens pulled from the owner.
    function seedBase(int24 tickLower, int24 tickUpper, uint256 wethAmt, uint256 usdcAmt) external {
        if (msg.sender != owner) revert NotOwner();
        weth.safeTransferFrom(msg.sender, address(this), wethAmt);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmt);
        Book storage b = books[BASE];
        b.weth += wethAmt;
        b.usdc += usdcAmt;
        poolManager.unlock(abi.encode(Op.AddBase, BASE, abi.encode(tickLower, tickUpper)));
        emit BaseSeeded(tickLower, tickUpper, b.liquidity);
    }

    // ---------------------------------------------------------------- settler

    function closePosition(address m) external onlySettler {
        if (books[m].liquidity == 0) return;
        poolManager.unlock(abi.encode(Op.Close, m, ""));
        emit PositionClosed(m, books[m].weth, books[m].usdc);
    }

    function openPosition(address m) external onlySettler {
        (int24 lo, int24 hi) = registry.ticks(m);
        poolManager.unlock(abi.encode(Op.Open, m, abi.encode(lo, hi)));
        emit PositionOpened(m, lo, hi, books[m].liquidity);
    }

    /// @notice Inventory value at oracle price `p` (USDC 6d per WETH). Position must be closed (settlement).
    function value(address m, uint256 p) public view returns (uint256) {
        Book storage b = books[m];
        return b.usdc + b.weth * p / 1e18;
    }

    /// @notice Record USDC that the settler already moved into this contract for `m`.
    function credit(address m, uint256 amount) external onlySettler {
        books[m].usdc += amount;
        emit Credited(m, amount);
    }

    /// @notice Pay up to `amount` USDC from m's inventory to `to`, selling WETH in the pool if needed.
    /// @return paid may be < amount if inventory (after swap costs) is short; the caller keeps the rest as a claim.
    function payout(address m, uint256 amount, address to, uint256 p) external onlySettler returns (uint256 paid) {
        Book storage b = books[m];
        if (b.usdc < amount && b.weth > 0) {
            uint256 need = amount - b.usdc;
            uint256 wethIn = (need * 1e18 / p) * 10_150 / 10_000 + 1; // +1.5% for fee and slippage
            if (wethIn > b.weth) wethIn = b.weth;
            poolManager.unlock(abi.encode(Op.Swap, m, abi.encode(true, wethIn, p)));
        }
        paid = amount < b.usdc ? amount : b.usdc;
        b.usdc -= paid;
        if (paid > 0) usdc.safeTransfer(to, paid);
        emit Paid(m, to, paid);
    }

    /// @notice Send all of m's inventory to `to` (Paused manager closing out).
    function sweep(address m, address to) external onlySettler {
        Book storage b = books[m];
        uint256 w = b.weth;
        uint256 u = b.usdc;
        b.weth = 0;
        b.usdc = 0;
        if (w > 0) weth.safeTransfer(to, w);
        if (u > 0) usdc.safeTransfer(to, u);
        emit Swept(m, to, w, u);
    }

    // ---------------------------------------------------------------- unlock callback

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Op op, address m, bytes memory p) = abi.decode(data, (Op, address, bytes));
        BalanceDelta total;

        if (op == Op.Rebalance) {
            (int24 lo, int24 hi, bool sellWeth, uint256 amountIn, uint256 px) =
                abi.decode(p, (int24, int24, bool, uint256, uint256));
            total = _removeAll(m);
            if (amountIn > 0) total = total + _swap(m, sellWeth, amountIn, px);
            total = total + _addMax(m, lo, hi);
        } else if (op == Op.Close) {
            total = _removeAll(m);
        } else if (op == Op.Open || op == Op.AddBase) {
            (int24 lo, int24 hi) = abi.decode(p, (int24, int24));
            if (op == Op.AddBase) total = _removeAll(m);
            total = total + _addMax(m, lo, hi);
        } else {
            (bool sellWeth, uint256 amountIn, uint256 px) = abi.decode(p, (bool, uint256, uint256));
            total = _swap(m, sellWeth, amountIn, px);
        }

        _settle(_key.currency0, total.amount0());
        _settle(_key.currency1, total.amount1());
        return "";
    }

    // ---------------------------------------------------------------- internals

    function _salt(address m) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(m)));
    }

    function _removeAll(address m) internal returns (BalanceDelta d) {
        Book storage b = books[m];
        if (b.liquidity == 0) return d;
        (d,) = poolManager.modifyLiquidity(
            _key, ModifyLiquidityParams(b.tickLower, b.tickUpper, -int256(uint256(b.liquidity)), _salt(m)), ""
        );
        b.liquidity = 0;
        _apply(b, d);
    }

    function _addMax(address m, int24 lo, int24 hi) internal returns (BalanceDelta d) {
        Book storage b = books[m];
        b.tickLower = lo;
        b.tickUpper = hi;
        (uint256 a0, uint256 a1) = wethIs0 ? (b.weth, b.usdc) : (b.usdc, b.weth);
        // leave 1 wei of each so rounding-up in the pool can never exceed inventory
        a0 = a0 > 1 ? a0 - 1 : 0;
        a1 = a1 > 1 ? a1 - 1 : 0;
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            poolSqrtPrice(), TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), a0, a1
        );
        if (liq == 0) return d;
        (d,) = poolManager.modifyLiquidity(_key, ModifyLiquidityParams(lo, hi, int256(uint256(liq)), _salt(m)), "");
        b.liquidity = liq;
        _apply(b, d);
    }

    function _swap(address m, bool sellWeth, uint256 amountIn, uint256 px) internal returns (BalanceDelta d) {
        Book storage b = books[m];
        if (amountIn > (sellWeth ? b.weth : b.usdc)) revert InsufficientInventory();
        bool zeroForOne = sellWeth == wethIs0;
        (uint160 minS, uint160 maxS) = oracle.swapLimits(px);
        d = poolManager.swap(_key, SwapParams(zeroForOne, -int256(amountIn), zeroForOne ? minS : maxS), "");
        _apply(b, d);
    }

    /// @dev Positive delta = tokens owed to us. Book inventory is updated immediately; `_settle` nets the transfers.
    function _apply(Book storage b, BalanceDelta d) internal {
        (int128 dw, int128 du) = wethIs0 ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        b.weth = _add(b.weth, dw);
        b.usdc = _add(b.usdc, du);
    }

    function _add(uint256 x, int128 d) internal pure returns (uint256) {
        if (d >= 0) return x + uint256(uint128(d));
        uint256 sub = uint256(uint128(-d));
        if (sub > x) revert InsufficientInventory();
        return x - sub;
    }

    function _settle(Currency c, int128 amt) internal {
        if (amt < 0) {
            poolManager.sync(c);
            ERC20(Currency.unwrap(c)).safeTransfer(address(poolManager), uint256(uint128(-amt)));
            poolManager.settle();
        } else if (amt > 0) {
            poolManager.take(c, address(this), uint256(uint128(amt)));
        }
    }
}

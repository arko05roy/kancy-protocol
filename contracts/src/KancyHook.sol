// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";

/// @title KancyHook
/// @notice Guard hook for the single Kancy pool.
///  - Only the PositionBook may add or remove liquidity (Promise 1: capital stays in the pool).
///  - Only the owner may initialize a pool with this hook, and only one pool (fixed fee / tick spacing).
///  - afterSwap records swap count and volume for the Scoreboard and emits an event.
/// @dev `sender` in liquidity hooks is the address that called PoolManager.modifyLiquidity. PositionBook must
///      therefore call the PoolManager directly (unlock callback), not route through PositionManager, or the
///      guard would admit every PositionManager user.
contract KancyHook is IHooks {
    using StateLibrary for IPoolManager;

    error NotPoolManager();
    error NotOwner();
    error PositionBookAlreadySet();
    error UnauthorizedLiquidityChange(address sender);
    error PoolAlreadyBound();
    error InvalidPoolConfig();
    error HookNotImplemented();

    event PositionBookSet(address indexed positionBook);
    event PoolBound(PoolId indexed poolId);
    /// @notice Signed amounts from the swapper's point of view (negative = paid into the pool).
    event KancySwap(
        PoolId indexed poolId,
        address indexed sender,
        int128 amount0,
        int128 amount1,
        uint160 sqrtPriceX96,
        int24 tick
    );

    uint24 public constant POOL_FEE = 3000; // 0.30%
    int24 public constant TICK_SPACING = 60;

    IPoolManager public immutable poolManager;
    address public immutable owner;

    address public positionBook;
    PoolId public poolId;
    bool public poolBound;

    uint256 public swapCount;
    /// @notice Cumulative absolute token volume (raw units).
    uint256 public volume0;
    uint256 public volume1;

    constructor(IPoolManager _poolManager, address _owner) {
        poolManager = _poolManager;
        owner = _owner;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice One-time wiring of the PositionBook (deployed after the hook).
    function setPositionBook(address _positionBook) external {
        if (msg.sender != owner) revert NotOwner();
        if (positionBook != address(0)) revert PositionBookAlreadySet();
        positionBook = _positionBook;
        emit PositionBookSet(_positionBook);
    }

    // ---------------------------------------------------------------- active hooks

    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != owner) revert NotOwner();
        if (poolBound) revert PoolAlreadyBound();
        if (key.fee != POOL_FEE || key.tickSpacing != TICK_SPACING) revert InvalidPoolConfig();
        poolBound = true;
        poolId = key.toId();
        emit PoolBound(poolId);
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        _checkLiquiditySender(sender);
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        _checkLiquiditySender(sender);
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterSwap(address sender, PoolKey calldata key, SwapParams calldata, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        int128 a0 = delta.amount0();
        int128 a1 = delta.amount1();
        unchecked {
            swapCount++;
        }
        volume0 += _abs(a0);
        volume1 += _abs(a1);
        PoolId id = key.toId();
        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(id);
        emit KancySwap(id, sender, a0, a1, sqrtPriceX96, tick);
        return (IHooks.afterSwap.selector, 0);
    }

    // ---------------------------------------------------------------- internals

    function _checkLiquiditySender(address sender) internal view {
        if (sender != positionBook || sender == address(0)) revert UnauthorizedLiquidityChange(sender);
    }

    function _abs(int128 x) internal pure returns (uint256) {
        return x < 0 ? uint256(uint128(-x)) : uint256(uint128(x));
    }

    // ---------------------------------------------------------------- unused hooks

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {KancyHook} from "../src/KancyHook.sol";

contract KancyHookTest is Test, Deployers {
    KancyHook hook;
    /// Stand-in for PositionBook until it exists: a router whose address the hook trusts.
    PoolModifyLiquidityTest book;

    uint160 constant FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            | Hooks.AFTER_SWAP_FLAG
    );

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        address hookAddr = address(FLAGS | (uint160(0x4b414e4359) << 144)); // "KANCY" prefix
        deployCodeTo("KancyHook.sol:KancyHook", abi.encode(manager, address(this)), hookAddr);
        hook = KancyHook(hookAddr);

        book = new PoolModifyLiquidityTest(manager);
        MockERC20(Currency.unwrap(currency0)).approve(address(book), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(book), type(uint256).max);
        hook.setPositionBook(address(book));

        (key,) = initPool(currency0, currency1, IHooks(hookAddr), 3000, SQRT_PRICE_1_1);
    }

    // ---------------------------------------------------------------- init

    function test_init_bindsPool() public view {
        assertTrue(hook.poolBound());
        assertEq(PoolId.unwrap(hook.poolId()), PoolId.unwrap(key.toId()));
    }

    function test_init_secondPoolReverts() public {
        // a different pair, same hook -> PoolAlreadyBound
        Currency c2 = deployMintAndApproveCurrency();
        (Currency a, Currency b) = c2 < currency1 ? (c2, currency1) : (currency1, c2);
        vm.expectRevert();
        manager.initialize(PoolKey(a, b, 3000, 60, IHooks(address(hook))), SQRT_PRICE_1_1);
    }

    function test_init_wrongFeeReverts() public {
        // fresh hook so the pool-bound check isn't what fires
        address a = address(FLAGS | (uint160(0x4b414e4358) << 144));
        deployCodeTo("KancyHook.sol:KancyHook", abi.encode(manager, address(this)), a);
        vm.expectRevert();
        manager.initialize(PoolKey(currency0, currency1, 500, 10, IHooks(a)), SQRT_PRICE_1_1);
    }

    function test_init_nonOwnerReverts() public {
        address a = address(FLAGS | (uint160(0x4b414e4357) << 144));
        deployCodeTo("KancyHook.sol:KancyHook", abi.encode(manager, address(this)), a);
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        manager.initialize(PoolKey(currency0, currency1, 3000, 60, IHooks(a)), SQRT_PRICE_1_1);
    }

    // ---------------------------------------------------------------- liquidity guard

    function test_positionBook_canAddAndRemove() public {
        book.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);
        book.modifyLiquidity(key, REMOVE_LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    function test_outsider_cannotAdd() public {
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    function test_outsider_cannotRemove() public {
        book.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(key, REMOVE_LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    function testFuzz_onlyPositionBookPasses(int24 lower, uint8 width, int128 liq) public {
        lower = int24(bound(lower, -887220 / 60, 887220 / 60 - 256)) * 60;
        int24 upper = lower + int24(uint24(width) + 1) * 60;
        liq = int128(bound(liq, 1, 1e18));
        ModifyLiquidityParams memory p = ModifyLiquidityParams(lower, upper, liq, 0);
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(key, p, ZERO_BYTES);
    }

    function test_setPositionBook_onlyOnceAndOwner() public {
        vm.expectRevert(KancyHook.PositionBookAlreadySet.selector);
        hook.setPositionBook(address(1));
        vm.prank(address(0xBEEF));
        vm.expectRevert(KancyHook.NotOwner.selector);
        hook.setPositionBook(address(1));
    }

    function test_hookCallbacks_onlyPoolManager() public {
        vm.expectRevert(KancyHook.NotPoolManager.selector);
        hook.beforeAddLiquidity(address(book), key, LIQUIDITY_PARAMS, ZERO_BYTES);
    }

    // ---------------------------------------------------------------- swap accounting

    function test_swap_updatesCountersAndEmits() public {
        book.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);

        vm.expectEmit(true, true, false, false, address(hook));
        emit KancyHook.KancySwap(key.toId(), address(swapRouter), 0, 0, 0, 0);
        swap(key, true, -1e15, ZERO_BYTES);

        assertEq(hook.swapCount(), 1);
        assertEq(hook.volume0(), 1e15);
        assertGt(hook.volume1(), 0);

        swap(key, false, -1e15, ZERO_BYTES);
        assertEq(hook.swapCount(), 2);
        assertEq(hook.volume1() > 1e15, true);
    }
}

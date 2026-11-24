// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";

import {KancyHook} from "../src/KancyHook.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {OracleAdapter, IAggregatorV3} from "../src/OracleAdapter.sol";
import {ManagerRegistry} from "../src/ManagerRegistry.sol";
import {PositionBook} from "../src/PositionBook.sol";
import {EpochSettler} from "../src/EpochSettler.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {KancyVault} from "../src/KancyVault.sol";
import {OraclePrice} from "../src/libraries/OraclePrice.sol";
import {IManagerRegistry, IPositionBook, IOracleAdapter, IVaultFactory} from "../src/interfaces/IKancy.sol";

/// @notice Full protocol on a local PoolManager with a mock oracle.
abstract contract KancyFixture is Test, Deployers {
    using StateLibrary for *;

    MockToken weth;
    MockToken usdc;
    MockAggregator feed;
    KancyHook hook;
    OracleAdapter oracle;
    ManagerRegistry registry;
    PositionBook book;
    EpochSettler settler;
    VaultFactory factory;
    bool wethIs0;

    uint256 constant EPOCH = 3600;
    int256 constant P0 = 2000e8;

    address good = makeAddr("goodManager");
    address bad = makeAddr("badManager");
    address curator = makeAddr("curator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address keeper = makeAddr("keeper");

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        deployFreshManagerAndRouters();

        weth = new MockToken("Mock WETH", "mWETH", 18, 5e18);
        usdc = new MockToken("Mock USDC", "mUSDC", 6, 10_000e6);
        wethIs0 = address(weth) < address(usdc);
        feed = new MockAggregator(P0);

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );
        address hookAddr = address(flags | (uint160(0x4b414e4359) << 144));
        deployCodeTo("KancyHook.sol:KancyHook", abi.encode(manager, address(this)), hookAddr);
        hook = KancyHook(hookAddr);

        (Currency c0, Currency c1) = wethIs0
            ? (Currency.wrap(address(weth)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(weth)));
        key = PoolKey(c0, c1, 3000, 60, IHooks(hookAddr));

        oracle = new OracleAdapter(IAggregatorV3(address(feed)), wethIs0, 90_000, 500);
        registry = new ManagerRegistry(ERC20(address(usdc)), 1000e6, 12);
        book = new PositionBook(
            manager, key, IOracleAdapter(address(oracle)), IManagerRegistry(address(registry)), weth, usdc
        );
        settler = new EpochSettler(
            IManagerRegistry(address(registry)),
            IPositionBook(address(book)),
            IOracleAdapter(address(oracle)),
            ERC20(address(usdc)),
            EPOCH,
            2000,
            1e6
        );
        factory = new VaultFactory(ERC20(address(usdc)), IManagerRegistry(address(registry)), address(settler), address(book));
        registry.wire(address(settler), address(book));
        book.wire(address(settler));
        settler.wire(IVaultFactory(address(factory)));
        hook.setPositionBook(address(book));

        manager.initialize(key, OraclePrice.toSqrtPriceX96(uint256(P0), 8, wethIs0));

        // protocol base depth: 200 WETH + 400k USDC over roughly ±45%
        weth.mint(address(this), 1_000_000e18);
        usdc.mint(address(this), 1_000_000_000e6);
        weth.approve(address(book), type(uint256).max);
        usdc.approve(address(book), type(uint256).max);
        weth.approve(address(swapRouter), type(uint256).max);
        usdc.approve(address(swapRouter), type(uint256).max);
        (int24 lo, int24 hi) = rangeAround(P0, 4500);
        book.seedBase(lo, hi, 200e18, 400_000e6);

        usdc.mint(address(settler), 1000e6); // keeper bounties
        for (uint256 i; i < 5; i++) {
            address u = [good, bad, curator, alice, bob][i];
            usdc.mint(u, 100_000e6);
            vm.prank(u);
            usdc.approve(address(registry), type(uint256).max);
        }
    }

    // ---------------------------------------------------------------- helpers

    function tickAt(int256 price8) internal view returns (int24) {
        return TickMath.getTickAtSqrtPrice(OraclePrice.toSqrtPriceX96(uint256(price8), 8, wethIs0));
    }

    function floorTick(int24 t) internal pure returns (int24) {
        int24 r = t / 60 * 60;
        if (t < 0 && t % 60 != 0) r -= 60;
        return r;
    }

    /// @param halfWidthTicks approx half-width in ticks (100 ticks ≈ 1%).
    function rangeAround(int256 price8, int24 halfWidthTicks) internal view returns (int24 lo, int24 hi) {
        int24 t = tickAt(price8);
        lo = floorTick(t - halfWidthTicks);
        hi = floorTick(t + halfWidthTicks) + 60;
    }

    /// @notice Move oracle and arbitrage the pool to it.
    function setPrice(int256 price8) internal {
        feed.setAnswer(price8);
        uint160 target = OraclePrice.toSqrtPriceX96(uint256(price8), 8, wethIs0);
        uint160 cur = book.poolSqrtPrice();
        if (cur == target) return;
        bool zeroForOne = target < cur;
        swapRouter.swap(
            key, SwapParams(zeroForOne, -1e36, target), PoolSwapTest.TestSettings(false, false), ZERO_BYTES
        );
    }

    /// @notice Round-trip swap traffic that returns the price to where it was (generates fees).
    function churn(uint256 rounds, uint256 wethAmt) internal {
        uint160 start = book.poolSqrtPrice();
        for (uint256 i; i < rounds; i++) {
            swapRouter.swap(
                key,
                SwapParams(wethIs0, -int256(wethAmt), wethIs0 ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
                PoolSwapTest.TestSettings(false, false),
                ZERO_BYTES
            );
            swapRouter.swap(
                key, SwapParams(!wethIs0, -1e36, start), PoolSwapTest.TestSettings(false, false), ZERO_BYTES
            );
        }
    }

    function settle() internal {
        vm.warp(settler.epochEndsAt());
        vm.prank(keeper);
        settler.settleEpoch();
    }

    function registerManager(address m, uint256 stakeAmt, int24 halfWidth) internal {
        (int24 lo, int24 hi) = rangeAround(int256(feed.answer()), halfWidth);
        vm.prank(m);
        registry.register("ipfs://meta", stakeAmt, lo, hi);
    }

    function newVault() internal returns (KancyVault v) {
        vm.prank(curator);
        v = KancyVault(factory.createVault("Blue Chip LP", "ipfs://vault", 1000, 1000, 50_000e6));
        for (uint256 i; i < 2; i++) {
            address u = [alice, bob][i];
            vm.prank(u);
            usdc.approve(address(v), type(uint256).max);
        }
    }

    function depositAs(KancyVault v, address u, uint256 amt) internal returns (uint256) {
        vm.prank(u);
        return v.deposit(amt);
    }

    function setTarget(KancyVault v, address m, uint256 amt) internal {
        address[] memory ms = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ms[0] = m;
        as_[0] = amt;
        vm.prank(curator);
        v.setTargets(ms, as_);
    }

    /// @notice USDC/WETH held by the book equals the sum of all books (no leakage).
    function assertBookSolvent() internal view {
        address[] memory ms = registry.managers();
        (,,, uint256 bw, uint256 bu) = book.books(address(0));
        for (uint256 i; i < ms.length; i++) {
            (,,, uint256 w, uint256 u) = book.books(ms[i]);
            bw += w;
            bu += u;
        }
        assertEq(weth.balanceOf(address(book)), bw, "weth leak");
        assertEq(usdc.balanceOf(address(book)), bu, "usdc leak");
    }

    /// @notice Manager-bot stand-in: put roughly half the USDC inventory into WETH at the current range.
    function rebalanceHalf(address m) internal {
        (int24 lo, int24 hi) = registry.ticks(m);
        (,,,, uint256 u) = book.books(m);
        vm.prank(m);
        book.rebalance(lo, hi, false, u / 2);
        setPrice(int256(feed.answer())); // swap-traffic bot re-arbitrages the pool to the oracle
    }
}

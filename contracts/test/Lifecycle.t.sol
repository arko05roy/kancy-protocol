// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {KancyFixture} from "./KancyFixture.sol";
import {KancyVault} from "../src/KancyVault.sol";
import {ManagerStatus} from "../src/interfaces/IKancy.sol";
import {EpochSettler} from "../src/EpochSettler.sol";

contract LifecycleTest is KancyFixture {
    /// @dev Register, run the Self-only epoch, become Active, join a vault and receive `alloc`.
    function _onboard(address m, uint256 stakeAmt, int24 halfWidth, KancyVault v, uint256 alloc) internal {
        registerManager(m, stakeAmt, halfWidth);
        settle(); // e1: stake moves into book, position opens (all USDC)
        rebalanceHalf(m);
        assertEq(uint8(registry.status(m)), uint8(ManagerStatus.SelfOnly));
        settle(); // e2: completed a Self-only epoch
        assertEq(uint8(registry.status(m)), uint8(ManagerStatus.Active));
        vm.prank(curator);
        v.addManager(m);
        setTarget(v, m, alloc);
    }

    // PRD G2: "Manager lost X — stake absorbed 100% — your loss: 0"
    function test_lossAbsorbedByStake_depositorLosesZero() public {
        KancyVault v = newVault();
        _onboard(bad, 2000e6, 600, v, 10_000e6);
        uint256 shares = depositAs(v, alice, 10_000e6);
        settle(); // e3: 10k allocated
        assertEq(registry.allocation(bad, address(v)), 10_000e6);
        rebalanceHalf(bad);

        setPrice(1940e8); // ETH -3%
        uint256 stakeBefore = registry.stake(bad);
        settle(); // e4: loss

        uint256 stakeAfter = registry.stake(bad);
        assertLt(stakeAfter, stakeBefore, "stake absorbed loss");
        assertEq(registry.allocation(bad, address(v)), 10_000e6, "backers untouched");
        assertEq(v.nav(), 10_000e6);
        assertEq(uint8(registry.status(bad)), uint8(ManagerStatus.Active));

        vm.prank(alice);
        v.requestWithdraw(shares);
        settle(); // e5
        vm.prank(alice);
        uint256 out = v.claim();
        assertEq(out, 10_000e6, "depositor loss = 0");
        assertBookSolvent();
    }

    function test_lossBeyondStake_hitsBackers_thenGraceThenPaused() public {
        KancyVault v = newVault();
        _onboard(bad, 1100e6, 300, v, 10_000e6);
        depositAs(v, alice, 10_000e6);
        settle();
        rebalanceHalf(bad);

        setPrice(1500e8); // ETH -25%, narrow range fully converted to WETH
        settle();

        assertEq(registry.stake(bad), 0, "stake wiped first");
        assertLt(v.nav(), 10_000e6, "remainder passed to backers");
        assertEq(uint8(registry.status(bad)), uint8(ManagerStatus.Grace));

        settle(); // no top-up -> Paused, capital returned to vault as idle
        assertEq(uint8(registry.status(bad)), uint8(ManagerStatus.Paused));
        assertGt(usdc.balanceOf(address(v)), 0);
        assertBookSolvent();
    }

    function test_graceRecoversWithTopUp() public {
        KancyVault v = newVault();
        _onboard(bad, 1100e6, 300, v, 10_000e6);
        depositAs(v, alice, 10_000e6);
        settle();
        rebalanceHalf(bad);
        setPrice(1700e8);
        settle();
        assertEq(uint8(registry.status(bad)), uint8(ManagerStatus.Grace));
        vm.prank(bad);
        registry.topUpStake(5000e6);
        settle();
        assertEq(uint8(registry.status(bad)), uint8(ManagerStatus.Active));
    }

    function test_profit_feesSplit() public {
        KancyVault v = newVault();
        _onboard(good, 5000e6, 1000, v, 20_000e6);
        depositAs(v, alice, 20_000e6);
        settle();
        rebalanceHalf(good);

        churn(20, 5e18);
        uint256 curatorBefore = usdc.balanceOf(curator);
        uint256 stakeBefore = registry.stake(good);
        settle();

        uint256 nav = v.nav(); // gain above the 20k target comes back to the vault as idle
        assertGt(nav, 20_000e6, "vault earned");
        assertEq(registry.allocation(good, address(v)), 20_000e6);
        assertGt(registry.stake(good), stakeBefore, "manager earned");
        uint256 curatorFee = usdc.balanceOf(curator) - curatorBefore;
        assertGt(curatorFee, 0, "curator cut paid");
        // vault gain = 80% of backed pnl; curator = 10% of the 20% fee = 2% -> 1/40 of vault gain
        assertApproxEqRel(curatorFee * 40, nav - 20_000e6, 0.01e18);
        assertBookSolvent();
    }

    function test_depositsSitIdleUntilSettlement() public {
        KancyVault v = newVault();
        _onboard(good, 5000e6, 1000, v, 20_000e6);
        depositAs(v, alice, 5_000e6);
        assertEq(registry.allocation(good, address(v)), 0);
        settle();
        assertEq(registry.allocation(good, address(v)), 5_000e6, "capped by available capital");
    }

    function test_targetCappedByStakeRatio() public {
        KancyVault v = newVault();
        _onboard(good, 2000e6, 1000, v, 50_000e6);
        depositAs(v, alice, 50_000e6);
        settle();
        assertEq(registry.allocation(good, address(v)), registry.stake(good) * 10, "stake / 10% ratio");
    }

    function test_withdrawQueue_cancel() public {
        KancyVault v = newVault();
        uint256 s = depositAs(v, alice, 1000e6);
        vm.startPrank(alice);
        v.requestWithdraw(s);
        assertEq(v.balanceOf(alice), 0);
        v.cancelWithdraw();
        assertEq(v.balanceOf(alice), s);
        vm.stopPrank();
    }

    function test_removeManager_returnsCapital() public {
        KancyVault v = newVault();
        _onboard(good, 5000e6, 1000, v, 10_000e6);
        depositAs(v, alice, 10_000e6);
        settle();
        rebalanceHalf(good);
        vm.prank(curator);
        v.removeManager(good);
        settle();
        assertEq(registry.allocation(good, address(v)), 0);
        assertApproxEqAbs(usdc.balanceOf(address(v)), 10_000e6, 1);
        settle();
        assertFalse(v.isManager(good));
    }

    function test_stakeWithdraw_onlySurplus() public {
        KancyVault v = newVault();
        _onboard(good, 3000e6, 1000, v, 10_000e6);
        depositAs(v, alice, 10_000e6);
        settle();
        vm.prank(good);
        registry.requestStakeWithdraw(type(uint256).max);
        uint256 balBefore = usdc.balanceOf(good);
        settle();
        // required = max(1000, 10% × 10k) = 1000; everything above it is paid out
        assertEq(registry.stake(good), 1000e6);
        assertGt(usdc.balanceOf(good) - balBefore, 1900e6);
    }

    // ---------------------------------------------------------------- guards

    function test_settle_beforeEpochEnd_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(EpochSettler.EpochNotOver.selector, settler.epochEndsAt()));
        settler.settleEpoch();
    }

    function test_settle_revertsOnPoolDeviation() public {
        registerManager(good, 2000e6, 600);
        // push pool 10% away from oracle
        int256 p = feed.answer();
        setPrice(p * 110 / 100);
        feed.setAnswer(p);
        vm.warp(settler.epochEndsAt());
        vm.expectRevert();
        settler.settleEpoch();
    }

    function test_settle_revertsOnStaleOracle() public {
        vm.warp(block.timestamp + 90_001);
        vm.expectRevert();
        settler.settleEpoch();
    }

    function test_outsiderCannotMoveFunds() public {
        vm.expectRevert(bytes4(keccak256("NotSettler()")));
        book.payout(good, 1, address(this), 2000e6);
        vm.expectRevert(bytes4(keccak256("NotSettler()")));
        book.sweep(good, address(this));
    }

    function test_rebalanceLimit() public {
        registerManager(good, 2000e6, 600);
        settle();
        (int24 lo, int24 hi) = registry.ticks(good);
        vm.startPrank(good);
        for (uint256 i; i < 12; i++) {
            book.rebalance(lo, hi, false, 0);
        }
        vm.expectRevert(bytes4(keccak256("RebalanceLimit()")));
        book.rebalance(lo, hi, false, 0);
        vm.stopPrank();
    }

    function test_unregisteredCannotRebalance() public {
        vm.prank(alice);
        vm.expectRevert(bytes4(keccak256("CannotRebalance()")));
        book.rebalance(-60, 60, false, 0);
    }

    function test_cannotAddNonActiveManager() public {
        KancyVault v = newVault();
        registerManager(good, 2000e6, 600);
        vm.prank(curator);
        vm.expectRevert(KancyVault.NotActiveManager.selector);
        v.addManager(good);
    }

    function test_keeperGetsBounty() public {
        settle();
        assertEq(usdc.balanceOf(keeper), 1e6);
    }
}

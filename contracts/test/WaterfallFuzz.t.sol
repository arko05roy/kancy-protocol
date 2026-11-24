// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {KancyFixture} from "./KancyFixture.sol";
import {KancyVault} from "../src/KancyVault.sol";

contract WaterfallFuzzTest is KancyFixture {
    /// Invariants after any single-epoch price move:
    ///  - a backer loses only if the stake is fully used (stake == 0)
    ///  - book token balances equal the sum of its per-manager books
    function testFuzz_backerLosesOnlyAfterStake(uint256 stakeAmt, uint24 halfWidth, int256 movePct) public {
        stakeAmt = bound(stakeAmt, 1100e6, 20_000e6);
        int24 hw = int24(uint24(bound(halfWidth, 120, 3000)));
        movePct = bound(movePct, -30, 30);

        KancyVault v = newVault();
        registerManager(bad, stakeAmt, hw);
        settle();
        rebalanceHalf(bad);
        settle();
        vm.prank(curator);
        v.addManager(bad);
        setTarget(v, bad, 50_000e6);
        depositAs(v, alice, 50_000e6);
        settle();
        rebalanceHalf(bad);

        uint256 allocBefore = registry.allocation(bad, address(v));
        setPrice(P0 * (100 + movePct) / 100);

        // value the book at the new oracle price the way the settler will
        vm.warp(settler.epochEndsAt());
        vm.recordLogs();
        vm.prank(keeper);
        settler.settleEpoch();

        uint256 allocAfterPnl = _allocAfterPnl(allocBefore);
        if (allocAfterPnl < allocBefore) {
            assertEq(registry.stake(bad), 0, "backer hit while stake > 0");
        }
        assertBookSolvent();
    }

    /// @dev Reads fromBackers from the ManagerSettled event (allocation is reallocated in the same tx).
    function _allocAfterPnl(uint256 allocBefore) internal returns (uint256) {
        bytes32 sig = keccak256(
            "ManagerSettled(address,uint64,uint256,uint256,int256,uint256,uint256,uint256,uint256,uint256,uint256)"
        );
        VmSafeLog[] memory logs = _logs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == sig && address(uint160(uint256(logs[i].topics[1]))) == bad) {
                (,,,,,, uint256 fromBackers,,) = abi.decode(
                    logs[i].data, (uint256, uint256, int256, uint256, uint256, uint256, uint256, uint256, uint256)
                );
                return allocBefore - fromBackers;
            }
        }
        revert("no ManagerSettled");
    }

    struct VmSafeLog {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function _logs() internal returns (VmSafeLog[] memory out) {
        bytes memory raw = abi.encode(vm.getRecordedLogs());
        out = abi.decode(raw, (VmSafeLog[]));
    }
}

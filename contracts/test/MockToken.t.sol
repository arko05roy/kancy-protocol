// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/mocks/MockToken.sol";

contract MockTokenTest is Test {
    MockToken usdc;

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockToken("Mock USDC", "mUSDC", 6, 10_000e6);
    }

    function test_faucet_oncePerDay() public {
        vm.startPrank(address(0xA));
        usdc.faucet();
        assertEq(usdc.balanceOf(address(0xA)), 10_000e6);
        vm.expectRevert(abi.encodeWithSelector(MockToken.FaucetCooldown.selector, block.timestamp + 1 days));
        usdc.faucet();
        vm.warp(block.timestamp + 1 days);
        usdc.faucet();
        assertEq(usdc.balanceOf(address(0xA)), 20_000e6);
    }

    function test_mint_onlyOwner() public {
        usdc.mint(address(0xA), 1);
        vm.prank(address(0xA));
        vm.expectRevert(MockToken.NotOwner.selector);
        usdc.mint(address(0xA), 1);
    }
}

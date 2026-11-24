// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {KancyHook} from "../src/KancyHook.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {OraclePrice} from "../src/libraries/OraclePrice.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Phase 1: mock tokens, KancyHook (mined address), mWETH/mUSDC pool initialised at the Chainlink price.
/// forge script script/DeployPhase1.s.sol --rpc-url unichain_sepolia --account <keystore> --broadcast
contract DeployPhase1 is Script {
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
    IAggregatorV3 constant ETH_USD = IAggregatorV3(0xd9c93081210dFc33326B2af4C2c11848095E6a9a);
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        uint256 answer = _oraclePrice();

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );

        vm.startBroadcast();
        address deployer = msg.sender;

        MockToken usdc = new MockToken("Kancy Mock USDC", "mUSDC", 6, 10_000e6);
        MockToken weth = new MockToken("Kancy Mock WETH", "mWETH", 18, 5e18);

        bytes memory args = abi.encode(POOL_MANAGER, deployer);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(KancyHook).creationCode, args);
        (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, type(KancyHook).creationCode, args));
        require(ok && hookAddr.code.length > 0, "hook deploy failed");
        KancyHook hook = KancyHook(hookAddr);

        int24 tick = _initPool(weth, usdc, hook, answer);
        vm.stopBroadcast();

        console2.log("ETH/USD (8d)  ", answer);
        console2.log("mUSDC         ", address(usdc));
        console2.log("mWETH         ", address(weth));
        console2.log("KancyHook     ", address(hook));
        console2.log("init tick     ");
        console2.logInt(tick);
    }

    function _initPool(MockToken weth, MockToken usdc, KancyHook hook, uint256 answer) internal returns (int24) {
        bool wethIs0 = address(weth) < address(usdc);
        (Currency c0, Currency c1) = wethIs0
            ? (Currency.wrap(address(weth)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(weth)));
        PoolKey memory key = PoolKey(c0, c1, hook.POOL_FEE(), hook.TICK_SPACING(), IHooks(address(hook)));
        return POOL_MANAGER.initialize(key, OraclePrice.toSqrtPriceX96(answer, ETH_USD.decimals(), wethIs0));
    }

    function _oraclePrice() internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = ETH_USD.latestRoundData();
        require(answer > 0, "bad oracle answer");
        require(block.timestamp - updatedAt <= 90_000, "oracle stale");
        return uint256(answer);
    }
}

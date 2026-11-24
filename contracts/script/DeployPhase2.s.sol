// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {KancyHook} from "../src/KancyHook.sol";
import {MockToken} from "../src/mocks/MockToken.sol";
import {OracleAdapter, IAggregatorV3} from "../src/OracleAdapter.sol";
import {ManagerRegistry} from "../src/ManagerRegistry.sol";
import {PositionBook} from "../src/PositionBook.sol";
import {EpochSettler} from "../src/EpochSettler.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {IManagerRegistry, IPositionBook, IOracleAdapter, IVaultFactory} from "../src/interfaces/IKancy.sol";

/// @notice Phase 2: core protocol on top of the Phase 1 hook/pool. Wires the hook to PositionBook (one-time!).
contract DeployPhase2 is Script {
    using StateLibrary for IPoolManager;

    IPoolManager constant PM = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
    address constant FEED = 0xd9c93081210dFc33326B2af4C2c11848095E6a9a;

    struct Core {
        OracleAdapter oracle;
        ManagerRegistry registry;
        PositionBook book;
        EpochSettler settler;
        VaultFactory factory;
    }

    function run() external {
        string memory json = vm.readFile("deployments/unichain-sepolia.json");
        MockToken usdc = MockToken(vm.parseJsonAddress(json, ".mUSDC"));
        MockToken weth = MockToken(vm.parseJsonAddress(json, ".mWETH"));
        KancyHook hook = KancyHook(vm.parseJsonAddress(json, ".kancyHook"));
        bool wethIs0 = address(weth) < address(usdc);
        PoolKey memory key = wethIs0
            ? PoolKey(Currency.wrap(address(weth)), Currency.wrap(address(usdc)), 3000, 60, IHooks(address(hook)))
            : PoolKey(Currency.wrap(address(usdc)), Currency.wrap(address(weth)), 3000, 60, IHooks(address(hook)));

        vm.startBroadcast();
        Core memory c = _deploy(usdc, weth, key, wethIs0);
        hook.setPositionBook(address(c.book));
        _seed(c, usdc, weth, key);
        vm.stopBroadcast();

        console2.log("oracleAdapter  ", address(c.oracle));
        console2.log("managerRegistry", address(c.registry));
        console2.log("positionBook   ", address(c.book));
        console2.log("epochSettler   ", address(c.settler));
        console2.log("vaultFactory   ", address(c.factory));
    }

    function _deploy(MockToken usdc, MockToken weth, PoolKey memory key, bool wethIs0) internal returns (Core memory c) {
        c.oracle = new OracleAdapter(IAggregatorV3(FEED), wethIs0, 90_000, 500);
        c.registry = new ManagerRegistry(ERC20(address(usdc)), 1000e6, 12);
        c.book = new PositionBook(
            PM, key, IOracleAdapter(address(c.oracle)), IManagerRegistry(address(c.registry)), weth, usdc
        );
        c.settler = new EpochSettler(
            IManagerRegistry(address(c.registry)),
            IPositionBook(address(c.book)),
            IOracleAdapter(address(c.oracle)),
            ERC20(address(usdc)),
            3600,
            2000,
            1e6
        );
        c.factory = new VaultFactory(
            ERC20(address(usdc)), IManagerRegistry(address(c.registry)), address(c.settler), address(c.book)
        );
        c.registry.wire(address(c.settler), address(c.book));
        c.book.wire(address(c.settler));
        c.settler.wire(IVaultFactory(address(c.factory)));
    }

    /// @dev Protocol base depth (~±45% around the current tick) and keeper-bounty float.
    function _seed(Core memory c, MockToken usdc, MockToken weth, PoolKey memory key) internal {
        address me = msg.sender;
        weth.mint(me, 100e18);
        usdc.mint(me, 200_000e6);
        usdc.mint(address(c.settler), 5_000e6);
        weth.approve(address(c.book), type(uint256).max);
        usdc.approve(address(c.book), type(uint256).max);
        (, int24 tick,,) = PM.getSlot0(key.toId());
        int24 t = tick / 60 * 60;
        c.book.seedBase(t - 4500, t + 4560, 100e18, 200_000e6);
    }
}

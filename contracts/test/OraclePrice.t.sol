// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {OraclePrice} from "../src/libraries/OraclePrice.sol";

contract OraclePriceTest is Test {
    function test_ethAt1737_wethCurrency0() public pure {
        uint160 s = OraclePrice.toSqrtPriceX96(1737_88000000, 8, true);
        // raw price = 1737.88e6/1e18 = 1.73788e-9 -> tick ~ ln(1.73788e-9)/ln(1.0001) ~ -201,716
        int24 t = TickMath.getTickAtSqrtPrice(s);
        assertApproxEqAbs(t, -201716, 2);
    }

    function test_ethAt1737_usdcCurrency0_isInverse() public pure {
        int24 a = TickMath.getTickAtSqrtPrice(OraclePrice.toSqrtPriceX96(1737_88000000, 8, true));
        int24 b = TickMath.getTickAtSqrtPrice(OraclePrice.toSqrtPriceX96(1737_88000000, 8, false));
        assertApproxEqAbs(a, -b, 1);
    }

    function testFuzz_inRange(uint256 p, bool c0) public pure {
        p = bound(p, 1e8, 1_000_000e8); // $1 .. $1M
        uint160 s = OraclePrice.toSqrtPriceX96(p, 8, c0);
        assertGt(s, TickMath.MIN_SQRT_PRICE);
        assertLt(s, TickMath.MAX_SQRT_PRICE);
    }
}

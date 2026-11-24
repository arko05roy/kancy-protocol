// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";

/// @title OraclePrice
/// @notice Converts an oracle WETH price (USD, `oracleDecimals`) to a v4 sqrtPriceX96 for a WETH(18)/USDC(6) pool.
library OraclePrice {
    /// @param price WETH price in USD with `oracleDecimals` decimals (Chainlink: 8).
    /// @param wethIsCurrency0 true if WETH sorts below USDC (currency0 = WETH).
    function toSqrtPriceX96(uint256 price, uint8 oracleDecimals, bool wethIsCurrency0)
        internal
        pure
        returns (uint160)
    {
        // raw price (token1 per token0, in smallest units):
        //   WETH=c0: price * 1e6 / (1e18 * 10^d)   USDC=c0: 1e18 * 10^d / (price * 1e6)
        uint256 scale = 10 ** (12 + uint256(oracleDecimals)); // 1e18 * 10^d / 1e6
        uint256 ratioX192 = wethIsCurrency0
            ? FullMath.mulDiv(price, 1 << 192, scale)
            : FullMath.mulDiv(scale, 1 << 192, price);
        return uint160(FixedPointMathLib.sqrt(ratioX192));
    }
}

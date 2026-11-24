// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "v4-core/libraries/FullMath.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {OraclePrice} from "./libraries/OraclePrice.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @title OracleAdapter
/// @notice Wraps the ETH/USD feed. Checks staleness, positivity and pool-vs-oracle deviation (PRD §8.4).
contract OracleAdapter {
    error NotOwner();
    error StalePrice(uint256 updatedAt);
    error BadPrice();
    error PoolDeviation(uint256 poolPrice, uint256 oraclePrice);

    event ParamsSet(uint256 maxStaleness, uint256 maxDeviationBps);
    event FeedSet(address feed);

    address public immutable owner;
    bool public immutable wethIsCurrency0;
    IAggregatorV3 public feed;
    uint256 public maxStaleness;
    uint256 public maxDeviationBps;

    constructor(IAggregatorV3 _feed, bool _wethIsCurrency0, uint256 _maxStaleness, uint256 _maxDeviationBps) {
        owner = msg.sender;
        feed = _feed;
        wethIsCurrency0 = _wethIsCurrency0;
        maxStaleness = _maxStaleness;
        maxDeviationBps = _maxDeviationBps;
    }

    function setParams(uint256 _maxStaleness, uint256 _maxDeviationBps) external {
        if (msg.sender != owner) revert NotOwner();
        maxStaleness = _maxStaleness;
        maxDeviationBps = _maxDeviationBps;
        emit ParamsSet(_maxStaleness, _maxDeviationBps);
    }

    /// @notice Switch to a fallback feed (PRD §8.2).
    function setFeed(IAggregatorV3 _feed) external {
        if (msg.sender != owner) revert NotOwner();
        feed = _feed;
        emit FeedSet(address(_feed));
    }

    /// @return p USDC (6 decimals) per 1 WETH.
    function price() public view returns (uint256 p) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0) revert BadPrice();
        if (block.timestamp > updatedAt + maxStaleness) revert StalePrice(updatedAt);
        uint8 d = feed.decimals();
        p = d >= 6 ? uint256(answer) / 10 ** (d - 6) : uint256(answer) * 10 ** (6 - d);
        if (p == 0) revert BadPrice();
    }

    /// @notice Pool price, USDC (6d) per 1 WETH.
    function poolPrice(uint160 sqrtPriceX96) public view returns (uint256) {
        uint256 x128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64); // raw token1/token0, Q128
        return wethIsCurrency0 ? FullMath.mulDiv(x128, 1e18, 1 << 128) : FullMath.mulDiv(1e18, 1 << 128, x128);
    }

    function checkPool(uint160 sqrtPriceX96) external view {
        uint256 o = price();
        uint256 pp = poolPrice(sqrtPriceX96);
        uint256 diff = pp > o ? pp - o : o - pp;
        if (diff * 10_000 > o * maxDeviationBps) revert PoolDeviation(pp, o);
    }

    /// @notice sqrtPrice bounds corresponding to oracle price ± maxDeviation, for swap price limits.
    function swapLimits(uint256 p) external view returns (uint160 minSqrt, uint160 maxSqrt) {
        uint256 lo = p * (10_000 - maxDeviationBps) / 10_000;
        uint256 hi = p * (10_000 + maxDeviationBps) / 10_000;
        uint160 a = OraclePrice.toSqrtPriceX96(lo, 6, wethIsCurrency0);
        uint160 b = OraclePrice.toSqrtPriceX96(hi, 6, wethIsCurrency0);
        (minSqrt, maxSqrt) = a < b ? (a, b) : (b, a);
        if (minSqrt <= TickMath.MIN_SQRT_PRICE) minSqrt = TickMath.MIN_SQRT_PRICE + 1;
        if (maxSqrt >= TickMath.MAX_SQRT_PRICE) maxSqrt = TickMath.MAX_SQRT_PRICE - 1;
    }
}

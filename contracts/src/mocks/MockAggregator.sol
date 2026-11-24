// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MockAggregator
/// @notice TESTNET ONLY. Chainlink-shaped feed that an operator bot updates (PRD §8.2 last resort / demo mode).
contract MockAggregator {
    error NotOwner();

    event AnswerUpdated(int256 answer, uint256 updatedAt);

    address public immutable owner;
    uint8 public constant decimals = 8;
    string public constant description = "ETH / USD (Kancy testnet mock)";
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;

    constructor(int256 initial) {
        owner = msg.sender;
        _set(initial);
    }

    function setAnswer(int256 a) external {
        if (msg.sender != owner) revert NotOwner();
        _set(a);
    }

    function _set(int256 a) internal {
        answer = a;
        updatedAt = block.timestamp;
        roundId++;
        emit AnswerUpdated(a, block.timestamp);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}

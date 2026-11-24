// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @title MockToken
/// @notice Testnet-only ERC20 (mUSDC / mWETH) with a public faucet that pays a capped amount per address per day.
contract MockToken is ERC20 {
    error NotOwner();
    error FaucetCooldown(uint256 availableAt);

    event FaucetDrip(address indexed to, uint256 amount);
    event FaucetAmountSet(uint256 amount);

    uint256 public constant FAUCET_COOLDOWN = 1 days;

    address public immutable owner;
    uint256 public faucetAmount;
    mapping(address => uint256) public lastDrip;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_)
        ERC20(name_, symbol_, decimals_)
    {
        owner = msg.sender;
        faucetAmount = faucetAmount_;
    }

    /// @notice Pays `faucetAmount` to the caller at most once per `FAUCET_COOLDOWN`.
    function faucet() external {
        uint256 last = lastDrip[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) revert FaucetCooldown(last + FAUCET_COOLDOWN);
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit FaucetDrip(msg.sender, faucetAmount);
    }

    /// @notice Owner mint, for funding the protocol's swap-traffic and demo bots.
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _mint(to, amount);
    }

    function setFaucetAmount(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        faucetAmount = amount;
        emit FaucetAmountSet(amount);
    }
}

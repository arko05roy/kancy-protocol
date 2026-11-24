// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {KancyVault} from "./KancyVault.sol";
import {IManagerRegistry} from "./interfaces/IKancy.sol";

/// @title VaultFactory
/// @notice Anyone can create a Curator Vault.
contract VaultFactory {
    error TooManyVaults();

    event VaultCreated(
        address indexed vault,
        address indexed curator,
        string name,
        string metadataURI,
        uint16 curatorCutBps,
        uint16 minRatioBps,
        uint256 maxAllocation
    );

    uint256 public constant MAX_VAULTS = 20;

    ERC20 public immutable usdc;
    IManagerRegistry public immutable registry;
    address public immutable settler;
    address public immutable book;

    address[] internal _vaults;
    mapping(address => bool) public isVault;

    constructor(ERC20 _usdc, IManagerRegistry _registry, address _settler, address _book) {
        usdc = _usdc;
        registry = _registry;
        settler = _settler;
        book = _book;
    }

    function createVault(
        string calldata name,
        string calldata metadataURI,
        uint16 curatorCutBps,
        uint16 minRatioBps,
        uint256 maxAllocation
    ) external returns (address v) {
        if (_vaults.length >= MAX_VAULTS) revert TooManyVaults();
        v = address(
            new KancyVault(
                usdc,
                registry,
                settler,
                book,
                msg.sender,
                name,
                metadataURI,
                KancyVault.Config(curatorCutBps, minRatioBps, maxAllocation)
            )
        );
        isVault[v] = true;
        _vaults.push(v);
        emit VaultCreated(v, msg.sender, name, metadataURI, curatorCutBps, minRatioBps, maxAllocation);
    }

    function allVaults() external view returns (address[] memory) {
        return _vaults;
    }
}

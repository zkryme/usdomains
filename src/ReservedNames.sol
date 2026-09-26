// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReservedNames} from "./interfaces/IUSD.sol";
import {RejectNativeValue} from "./RejectNativeValue.sol";

/// @title ReservedNames
/// @notice Stores labels that must never enter the public mint.
/// @dev The registrar is the only writer. Reserving a label does not mint, burn, or transfer an NFT.
contract ReservedNames is Ownable, RejectNativeValue, IReservedNames {
    error OnlyRegistrar();
    error AlreadyWired();
    error ZeroAddress();

    address public registrar;

    mapping(bytes32 labelHash => bool reserved) private _reserved;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Points this registry at the registrar exactly once, then renounces ownership.
    function setRegistrar(address registrar_) external onlyOwner {
        if (registrar != address(0)) revert AlreadyWired();
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = registrar_;
        renounceOwnership();
    }

    function isReserved(bytes32 labelHash) external view returns (bool) {
        return _reserved[labelHash];
    }

    function setIfNew(bytes32 labelHash) external returns (bool added) {
        if (msg.sender != registrar) revert OnlyRegistrar();
        if (_reserved[labelHash]) return false;
        _reserved[labelHash] = true;
        return true;
    }

    function clearIfSet(bytes32 labelHash) external returns (bool removed) {
        if (msg.sender != registrar) revert OnlyRegistrar();
        if (!_reserved[labelHash]) return false;
        _reserved[labelHash] = false;
        return true;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IUSDName, IUSDRegistrarHooks} from "./interfaces/IUSD.sol";
import {RejectNativeValue} from "./RejectNativeValue.sol";

/// @title USDMetadata
/// @notice Artwork and JSON for a `.usd` control NFT.
/// @dev This contract is not the source of truth. Wallets may cache the result. Ownership and
///      expiry live on USDName and USDRegistrar. After a burn, `tokenURI` on USDName reverts.
///      After re-registration the same token id renders the new label state because the NFT
///      contract stores the current label and the registrar stores the current expiry.
contract USDMetadata is Ownable, RejectNativeValue {
    error AlreadyWired();
    error ZeroAddress();
    error UnknownToken();

    IUSDName public immutable nameContract;
    address public registrar;

    constructor(address initialOwner, IUSDName name_) Ownable(initialOwner) {
        nameContract = name_;
    }

    function setRegistrar(address registrar_) external onlyOwner {
        if (registrar != address(0)) revert AlreadyWired();
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = registrar_;
        renounceOwnership();
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json(tokenId))));
    }

    function json(uint256 tokenId) public view returns (string memory) {
        string memory label = nameContract.labelOf(tokenId);
        if (bytes(label).length == 0 || registrar == address(0)) revert UnknownToken();

        uint8 phase = IUSDRegistrarHooks(registrar).phase(tokenId);
        uint64 expiry = IUSDRegistrarHooks(registrar).expiryOf(tokenId);
        string memory phaseText = _phaseText(phase);
        string memory svg = string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 640'>",
            "<rect width='640' height='640' fill='#1c1915'/>",
            "<text x='48' y='280' fill='#f4f0e6' font-size='44' font-family='monospace'>",
            label,
            ".usd</text>",
            "<text x='48' y='340' fill='#c4b49a' font-size='20' font-family='monospace'>",
            phaseText,
            "</text></svg>"
        );
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));

        return string.concat(
            '{"name":"',
            label,
            '.usd","description":"Control NFT for ',
            label,
            '.usd from US Domains (usdomains.xyz), an independent Arc naming service. This metadata is not authoritative. The USDName and USDRegistrar contracts define ownership and expiry. An expired or re-registered name can make cached metadata stale.",',
            '"image":"',
            image,
            '","attributes":[{"trait_type":"Label","value":"',
            label,
            '"},{"trait_type":"Phase","value":"',
            phaseText,
            '"},{"trait_type":"Expiry","display_type":"date","value":',
            Strings.toString(uint256(expiry)),
            "}]}"
        );
    }

    function _phaseText(uint8 phase) internal pure returns (string memory) {
        if (phase == 1) return "active";
        if (phase == 2) return "grace - does not resolve";
        return "lapsed - nft does not control the name";
    }
}

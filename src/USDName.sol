// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUSDRegistrarHooks, IUSDResolver, IUSDReverse} from "./interfaces/IUSD.sol";
import {RejectNativeValue} from "./RejectNativeValue.sol";

interface IUSDMetadata {
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/// @title USDName
/// @notice ERC-721 control token for a `.usd` label.
/// @dev The token id is `uint256(keccak256(label))`. Only the registrar can mint or burn.
///      A transfer updates the owner immediately; management reads `ownerOf` and does not
///      use a lagged controller. After the grace period the NFT no longer authorizes
///      management, even if it has not yet been burned.
contract USDName is ERC721, Ownable, RejectNativeValue {
    error OnlyRegistrar();
    error TokenIdMismatch();
    error NotWired();

    address public registrar;
    IUSDResolver public resolver;
    IUSDReverse public reverseRegistrar;
    address public metadata;

    mapping(uint256 tokenId => string label) private _labels;

    constructor(address initialOwner) ERC721("US Domains", "USDNAME") Ownable(initialOwner) {}

    /// @notice One-time wiring. Ownership is renounced in the same call.
    function wire(address registrar_, address resolver_, address reverse_, address metadata_) external onlyOwner {
        if (registrar != address(0)) revert NotWired();
        if (registrar_ == address(0) || resolver_ == address(0) || reverse_ == address(0) || metadata_ == address(0)) {
            revert NotWired();
        }
        registrar = registrar_;
        resolver = IUSDResolver(resolver_);
        reverseRegistrar = IUSDReverse(reverse_);
        metadata = metadata_;
        renounceOwnership();
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function labelOf(uint256 tokenId) external view returns (string memory) {
        return _labels[tokenId];
    }

    /// @notice True when `operator` may change records for a name that is still active or in grace.
    function canManage(uint256 tokenId, address operator) public view returns (bool) {
        if (operator == address(0) || registrar == address(0)) return false;
        if (!IUSDRegistrarHooks(registrar).inRenewalWindow(tokenId)) return false;
        address tokenOwner = ownerOf(tokenId);
        return operator == tokenOwner || isApprovedForAll(tokenOwner, operator) || getApproved(tokenId) == operator;
    }

    function mint(address to, uint256 tokenId, string calldata label) external {
        if (msg.sender != registrar) revert OnlyRegistrar();
        if (tokenId != uint256(keccak256(bytes(label)))) revert TokenIdMismatch();
        _labels[tokenId] = label;
        _safeMint(to, tokenId);
    }

    function burn(uint256 tokenId) external {
        if (msg.sender != registrar) revert OnlyRegistrar();
        _burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (metadata == address(0)) revert NotWired();
        return IUSDMetadata(metadata).tokenURI(tokenId);
    }

    /// @dev Mint and burn are registrar-only. User transfers keep ERC-721 authorization and
    ///      clear a previous primary name in the same transaction.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if ((from == address(0) || to == address(0)) && msg.sender != registrar) revert OnlyRegistrar();

        address previous = super._update(to, tokenId, auth);

        if (to == address(0)) {
            resolver.clear(tokenId);
            reverseRegistrar.onNameCleared(tokenId, previous);
            delete _labels[tokenId];
        } else if (previous != address(0)) {
            reverseRegistrar.onNameCleared(tokenId, previous);
        }

        return previous;
    }
}

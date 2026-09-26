// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUSDName, IUSDRegistrarHooks} from "./interfaces/IUSD.sol";
import {LabelValidator} from "./libraries/LabelValidator.sol";
import {RejectNativeValue} from "./RejectNativeValue.sol";

/// @title USDResolver
/// @notice Forward records for a `.usd` label.
/// @dev Stored records are not authoritative while a name is expired or in grace.
///      `addrIfActive` and `textIfActive` return empty unless the registrar says the name is active.
///      Record slots are versioned. Burning the NFT increments the version, so a later registrant
///      cannot read the previous owner's address or text.
contract USDResolver is Ownable, RejectNativeValue {
    uint256 public constant MAX_KEY_BYTES = 32;
    uint256 public constant MAX_VALUE_BYTES = 256;

    error AlreadyWired();
    error ZeroAddress();
    error UnknownName();
    error NotManager();
    error OnlyName();
    error InvalidKey();
    error InvalidValue();

    IUSDName public immutable nameContract;
    address public registrar;

    mapping(uint256 tokenId => uint64 version) public recordVersion;
    mapping(uint256 tokenId => mapping(uint64 version => address paymentAddress)) private _addresses;
    mapping(uint256 tokenId => mapping(uint64 version => mapping(bytes32 keyHash => string value))) private _texts;

    event AddressRecordSet(uint256 indexed tokenId, address paymentAddress);
    event TextRecordSet(uint256 indexed tokenId, string key, string value);
    event RecordsCleared(uint256 indexed tokenId, uint64 version);

    constructor(address initialOwner, IUSDName name_) Ownable(initialOwner) {
        nameContract = name_;
    }

    function setRegistrar(address registrar_) external onlyOwner {
        if (registrar != address(0)) revert AlreadyWired();
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = registrar_;
        renounceOwnership();
    }

    /// @notice Stored address, including records that must not be treated as live.
    function addr(uint256 tokenId) external view returns (address) {
        return _addresses[tokenId][recordVersion[tokenId]];
    }

    /// @notice Payment address for an active registration. Returns address(0) when the name is not active.
    function addrIfActive(string calldata label) external view returns (address) {
        if (LabelValidator.diagnose(label, LabelValidator.MIN_PUBLIC_LENGTH) != LabelValidator.OK) return address(0);
        uint256 tokenId = LabelValidator.idOf(label);
        if (!_active(tokenId)) return address(0);
        return _addresses[tokenId][recordVersion[tokenId]];
    }

    /// @notice Stored text, including records that must not be treated as live.
    function text(uint256 tokenId, string calldata key) external view returns (string memory) {
        return _texts[tokenId][recordVersion[tokenId]][keccak256(bytes(key))];
    }

    /// @notice Text for an active registration. Returns empty when the name is not active.
    function textIfActive(string calldata label, string calldata key) external view returns (string memory) {
        if (LabelValidator.diagnose(label, LabelValidator.MIN_PUBLIC_LENGTH) != LabelValidator.OK) return "";
        uint256 tokenId = LabelValidator.idOf(label);
        if (!_active(tokenId)) return "";
        return _texts[tokenId][recordVersion[tokenId]][keccak256(bytes(key))];
    }

    function setAddress(string calldata label, address paymentAddress) external {
        uint256 tokenId = _managed(label);
        _addresses[tokenId][recordVersion[tokenId]] = paymentAddress;
        emit AddressRecordSet(tokenId, paymentAddress);
    }

    /// @notice Sets one text record. An empty value clears that key. Keys and values are size-limited.
    function setText(string calldata label, string calldata key, string calldata value) external {
        uint256 keyLength = bytes(key).length;
        if (keyLength == 0 || keyLength > MAX_KEY_BYTES) revert InvalidKey();
        if (bytes(value).length > MAX_VALUE_BYTES) revert InvalidValue();

        uint256 tokenId = _managed(label);
        _texts[tokenId][recordVersion[tokenId]][keccak256(bytes(key))] = value;
        emit TextRecordSet(tokenId, key, value);
    }

    /// @notice Drops the current record version. Called by the NFT contract when a name is burned.
    function clear(uint256 tokenId) external {
        if (msg.sender != address(nameContract)) revert OnlyName();
        uint64 nextVersion = recordVersion[tokenId] + 1;
        recordVersion[tokenId] = nextVersion;
        emit RecordsCleared(tokenId, nextVersion);
    }

    function _managed(string calldata label) internal view returns (uint256 tokenId) {
        LabelValidator.requirePublic(label);
        tokenId = LabelValidator.idOf(label);
        if (!nameContract.exists(tokenId)) revert UnknownName();
        if (!nameContract.canManage(tokenId, msg.sender)) revert NotManager();
    }

    function _active(uint256 tokenId) internal view returns (bool) {
        if (registrar == address(0)) return false;
        return IUSDRegistrarHooks(registrar).isActive(tokenId);
    }
}

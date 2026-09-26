// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUSDName, IUSDRegistrarHooks, IUSDResolver} from "./interfaces/IUSD.sol";
import {LabelValidator} from "./libraries/LabelValidator.sol";
import {RejectNativeValue} from "./RejectNativeValue.sol";

/// @title USDReverse
/// @notice A wallet's preferred `.usd` name.
/// @dev A reverse read is verified before it can be displayed. The stored preference is returned
///      only when the name is active, the wallet currently owns it, and its forward record points
///      at that same wallet. A transfer or burn clears the previous owner's preference.
contract USDReverse is Ownable, RejectNativeValue {
    error AlreadyWired();
    error ZeroAddress();
    error NotOwner();
    error NotActive();
    error ForwardMismatch();
    error NoPrimary();
    error OnlyName();

    struct Primary {
        uint256 tokenId;
        bool set;
    }

    IUSDName public immutable nameContract;
    IUSDResolver public immutable resolver;
    address public registrar;

    mapping(address wallet => Primary primary) private _primary;

    event PrimaryNameSet(address indexed wallet, uint256 indexed tokenId, string label);
    event PrimaryNameCleared(address indexed wallet, uint256 indexed tokenId);

    constructor(address initialOwner, IUSDName name_, IUSDResolver resolver_) Ownable(initialOwner) {
        nameContract = name_;
        resolver = resolver_;
    }

    function setRegistrar(address registrar_) external onlyOwner {
        if (registrar != address(0)) revert AlreadyWired();
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = registrar_;
        renounceOwnership();
    }

    /// @notice Sets the caller's primary name. The forward record must already point at the caller.
    function setPrimary(string calldata label) external {
        LabelValidator.requirePublic(label);
        uint256 tokenId = LabelValidator.idOf(label);
        if (nameContract.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (!IUSDRegistrarHooks(registrar).isActive(tokenId)) revert NotActive();
        if (resolver.addr(tokenId) != msg.sender) revert ForwardMismatch();

        _primary[msg.sender] = Primary({tokenId: tokenId, set: true});
        emit PrimaryNameSet(msg.sender, tokenId, label);
    }

    function clearPrimary() external {
        Primary memory current = _primary[msg.sender];
        if (!current.set) revert NoPrimary();
        delete _primary[msg.sender];
        emit PrimaryNameCleared(msg.sender, current.tokenId);
    }

    /// @notice Raw preference, without the forward-resolution check. Integrators must use {reverse}.
    function primarySetting(address wallet) external view returns (uint256 tokenId, bool set) {
        Primary memory current = _primary[wallet];
        return (current.tokenId, current.set);
    }

    /// @notice Verified primary name. `verified` is false, and `label` is empty, unless every check passes.
    function reverse(address wallet) external view returns (string memory label, bool verified) {
        Primary memory current = _primary[wallet];
        if (!current.set || registrar == address(0)) return ("", false);
        if (!IUSDRegistrarHooks(registrar).isActive(current.tokenId)) return ("", false);
        if (nameContract.ownerOf(current.tokenId) != wallet) return ("", false);
        if (resolver.addr(current.tokenId) != wallet) return ("", false);
        return (nameContract.labelOf(current.tokenId), true);
    }

    function onNameCleared(uint256 tokenId, address previousOwner) external {
        if (msg.sender != address(nameContract)) revert OnlyName();
        Primary memory current = _primary[previousOwner];
        if (current.set && current.tokenId == tokenId) {
            delete _primary[previousOwner];
            emit PrimaryNameCleared(previousOwner, tokenId);
        }
    }
}

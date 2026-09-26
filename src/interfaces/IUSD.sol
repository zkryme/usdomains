// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IUSDName {
    function mint(address to, uint256 tokenId, string calldata label) external;
    function burn(uint256 tokenId) external;
    function exists(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
    function labelOf(uint256 tokenId) external view returns (string memory);
    function canManage(uint256 tokenId, address operator) external view returns (bool);
}

interface IUSDResolver {
    function clear(uint256 tokenId) external;
    function addr(uint256 tokenId) external view returns (address);
}

interface IUSDReverse {
    function onNameCleared(uint256 tokenId, address previousOwner) external;
}

interface IReservedNames {
    function setIfNew(bytes32 labelHash) external returns (bool added);
    function clearIfSet(bytes32 labelHash) external returns (bool removed);
    function isReserved(bytes32 labelHash) external view returns (bool);
}

interface IUSDRegistrarHooks {
    function isActive(uint256 tokenId) external view returns (bool);
    function inRenewalWindow(uint256 tokenId) external view returns (bool);
    function phase(uint256 tokenId) external view returns (uint8);
    function expiryOf(uint256 tokenId) external view returns (uint64);
}

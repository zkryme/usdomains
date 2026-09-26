// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Arc parameters checked against docs.arc.io on 2026-09-26.
/// @dev Native USDC uses 18 decimals. The ERC-20 interface uses 6. This library records the
///      addresses and chain ids only. Payment math must stay in 6-decimal ERC-20 units.
library ArcChain {
    uint256 internal constant TESTNET_CHAIN_ID = 5042002;
    uint256 internal constant MAINNET_CHAIN_ID = 5042;
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    uint8 internal constant ERC20_DECIMALS = 6;
    uint8 internal constant NATIVE_DECIMALS = 18;
}

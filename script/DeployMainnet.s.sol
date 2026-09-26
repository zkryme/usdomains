// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ArcChain} from "../src/ArcChain.sol";
import {Script} from "forge-std/Script.sol";

/// @notice Mainnet configuration is recorded here and deployment is refused.
/// @dev Arc mainnet, from docs.arc.io on 2026-09-26:
///      chain id 5042, RPC https://rpc.mainnet.arc.io, explorer https://explorer.arc.io,
///      USDC ERC-20 0x3600000000000000000000000000000000000000 (6 decimals).
///      Do not delete the revert in order to accept real funds.
contract DeployMainnet is Script {
    error MainnetDeploymentDisabled();

    function run() external pure {
        revert MainnetDeploymentDisabled();
    }

    function chainId() external pure returns (uint256) {
        return ArcChain.MAINNET_CHAIN_ID;
    }

    function usdc() external pure returns (address) {
        return ArcChain.USDC;
    }
}

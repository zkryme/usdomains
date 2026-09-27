// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArcChain} from "../src/ArcChain.sol";
import {IReservedNames, IUSDName, IUSDResolver} from "../src/interfaces/IUSD.sol";
import {ReservedNames} from "../src/ReservedNames.sol";
import {USDMetadata} from "../src/USDMetadata.sol";
import {USDName} from "../src/USDName.sol";
import {USDRegistrar} from "../src/USDRegistrar.sol";
import {USDResolver} from "../src/USDResolver.sol";
import {USDReverse} from "../src/USDReverse.sol";
import {USDTerms} from "../src/USDTerms.sol";

/// @notice Deploys to Arc Testnet in separate transactions and leaves registration paused.
/// @dev There is no factory: one factory cannot fit Arc's contract-size and block-gas limits
///      once the reserved-name seed is included. Each contract is created by the broadcaster.
///      The broadcaster is the one-time seed operator and then closes that role.
///
///      Required environment:
///      USD_CONFIRM_TESTNET=YES
///      PRIVATE_KEY
///      USD_ADMIN
///      USD_TREASURY
///      USD_TREASURY_CONTROLLER
///      Use a multisig for the admin and treasury controller before any later unpause.
contract DeployTestnet is Script {
    error ConfirmationRequired();
    error WrongChain(uint256 chainId);

    function run() external {
        if (keccak256(bytes(vm.envString("USD_CONFIRM_TESTNET"))) != keccak256(bytes("YES"))) {
            revert ConfirmationRequired();
        }
        if (block.chainid != ArcChain.TESTNET_CHAIN_ID) revert WrongChain(block.chainid);

        uint256 key = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(key);
        uint256 startBlock = block.number;
        address admin = vm.envAddress("USD_ADMIN");
        address treasury = vm.envAddress("USD_TREASURY");
        address controller = vm.envAddress("USD_TREASURY_CONTROLLER");
        string[] memory labels = vm.parseJsonStringArray(vm.readFile("script/reserved-names.json"), ".labels");

        vm.startBroadcast(key);

        USDName nameNft = new USDName(owner);
        USDResolver resolver = new USDResolver(owner, IUSDName(address(nameNft)));
        USDReverse reverseRegistrar =
            new USDReverse(owner, IUSDName(address(nameNft)), IUSDResolver(address(resolver)));
        ReservedNames reserved = new ReservedNames(owner);
        USDMetadata metadata = new USDMetadata(owner, IUSDName(address(nameNft)));
        USDRegistrar registrar = new USDRegistrar(
            IUSDName(address(nameNft)),
            IUSDResolver(address(resolver)),
            IReservedNames(address(reserved)),
            IERC20(ArcChain.USDC),
            admin,
            treasury,
            controller,
            admin,
            USDTerms.DEFAULT_GRACE,
            true
        );

        nameNft.wire(address(registrar), address(resolver), address(reverseRegistrar), address(metadata));
        resolver.setRegistrar(address(registrar));
        reverseRegistrar.setRegistrar(address(registrar));
        reserved.setRegistrar(address(registrar));
        metadata.setRegistrar(address(registrar));

        uint256 offset;
        while (offset < labels.length) {
            uint256 end = offset + USDTerms.MAX_BATCH;
            if (end > labels.length) end = labels.length;
            string[] memory batch = new string[](end - offset);
            for (uint256 i; i < batch.length; ++i) {
                batch[i] = labels[offset + i];
            }
            registrar.seedReservations(batch);
            registrar.confirmReservations(batch);
            offset = end;
        }

        registrar.closeSeed();
        vm.stopBroadcast();

        console2.log("name", address(nameNft));
        console2.log("resolver", address(resolver));
        console2.log("reverse", address(reverseRegistrar));
        console2.log("reserved", address(reserved));
        console2.log("metadata", address(metadata));
        console2.log("registrar", address(registrar));

        string memory output = string.concat(
            "{\n",
            '  "chainId": 5042002,\n',
            '  "deployed": true,\n',
            '  "registrationPaused": true,\n',
            '  "publicMintOpen": false,\n',
            '  "startBlock": ',
            vm.toString(startBlock),
            ',\n',
            '  "usdc": "',
            vm.toString(ArcChain.USDC),
            '",\n',
            '  "name": "',
            vm.toString(address(nameNft)),
            '",\n',
            '  "resolver": "',
            vm.toString(address(resolver)),
            '",\n',
            '  "reverse": "',
            vm.toString(address(reverseRegistrar)),
            '",\n',
            '  "reserved": "',
            vm.toString(address(reserved)),
            '",\n',
            '  "metadata": "',
            vm.toString(address(metadata)),
            '",\n',
            '  "registrar": "',
            vm.toString(address(registrar)),
            '"\n}\n'
        );
        vm.writeFile("deployments/arc-testnet.json", output);
    }
}

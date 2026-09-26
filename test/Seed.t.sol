// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployMainnet} from "../script/DeployMainnet.s.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IReservedNames, IUSDName, IUSDResolver} from "../src/interfaces/IUSD.sol";
import {ReservedNames} from "../src/ReservedNames.sol";
import {USDMetadata} from "../src/USDMetadata.sol";
import {USDName} from "../src/USDName.sol";
import {USDRegistrar} from "../src/USDRegistrar.sol";
import {USDResolver} from "../src/USDResolver.sol";
import {USDReverse} from "../src/USDReverse.sol";
import {USDTerms} from "../src/USDTerms.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SeedTest is Test {
    function test_seedFileDeploysPausedAndBlocksMint() public {
        string memory json = vm.readFile("script/reserved-names.json");
        string[] memory labels = vm.parseJsonStringArray(json, ".labels");
        assertGt(labels.length, 80);

        for (uint256 i; i < labels.length; ++i) {
            string memory entryLabel = vm.parseJsonString(json, string.concat(".entries[", vm.toString(i), "].label"));
            string memory reason = vm.parseJsonString(json, string.concat(".entries[", vm.toString(i), "].reason"));
            assertEq(entryLabel, labels[i]);
            assertGt(bytes(reason).length, 20);
        }

        MockUSDC usdc = new MockUSDC();
        USDName nameNft = new USDName(address(this));
        USDResolver resolver = new USDResolver(address(this), IUSDName(address(nameNft)));
        USDReverse reverseRegistrar =
            new USDReverse(address(this), IUSDName(address(nameNft)), IUSDResolver(address(resolver)));
        ReservedNames reserved = new ReservedNames(address(this));
        USDMetadata metadata = new USDMetadata(address(this), IUSDName(address(nameNft)));
        USDRegistrar registrar = new USDRegistrar(
            IUSDName(address(nameNft)),
            IUSDResolver(address(resolver)),
            IReservedNames(address(reserved)),
            IERC20(address(usdc)),
            address(this),
            address(this),
            address(this),
            USDTerms.DEFAULT_GRACE
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
            uint256 gasBefore = gasleft();
            registrar.seedReservations(batch);
            uint256 seedGas = gasBefore - gasleft();
            assertLt(seedGas, 8_000_000);
            registrar.confirmReservations(batch);
            offset = end;
        }

        registrar.closeSeed();
        assertTrue(registrar.registrationPaused());
        assertTrue(registrar.seedClosed());

        vm.expectRevert(USDRegistrar.SeedClosed.selector);
        registrar.seedReservations(labels);

        USDRegistrar.Inspection memory blocked = registrar.inspect("circle");
        assertEq(uint8(blocked.availability), uint8(USDRegistrar.Availability.Reserved));
        assertTrue(registrar.isLabelReserved("usdc"));
        assertTrue(registrar.isLabelReserved("arc-network"));
        assertTrue(registrar.isLabelReserved("metamask-official"));
    }

    function test_mainnetScriptCannotDeploy() public {
        DeployMainnet mainnet = new DeployMainnet();
        vm.expectRevert(DeployMainnet.ConfirmationRequired.selector);
        mainnet.run();
        assertEq(mainnet.chainId(), 5042);
        assertEq(mainnet.usdc(), 0x3600000000000000000000000000000000000000);
    }
}

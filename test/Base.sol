// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IReservedNames, IUSDName, IUSDResolver} from "../src/interfaces/IUSD.sol";
import {ReservedNames} from "../src/ReservedNames.sol";
import {USDMetadata} from "../src/USDMetadata.sol";
import {USDName} from "../src/USDName.sol";
import {USDTerms} from "../src/USDTerms.sol";
import {USDRegistrar} from "../src/USDRegistrar.sol";
import {USDResolver} from "../src/USDResolver.sol";
import {USDReverse} from "../src/USDReverse.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

abstract contract USDTestBase is Test {
    USDName internal nameNft;
    USDResolver internal resolver;
    USDReverse internal reverseRegistrar;
    ReservedNames internal reserved;
    USDMetadata internal metadata;
    USDRegistrar internal registrar;
    MockUSDC internal usdc;

    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal exempt = makeAddr("exempt");

    function setUp() public virtual {
        _deploy(address(new MockUSDC()));
        usdc = MockUSDC(address(registrar.usdc()));
    }

    function _deploy(address token) internal {
        nameNft = new USDName(address(this));
        resolver = new USDResolver(address(this), IUSDName(address(nameNft)));
        reverseRegistrar = new USDReverse(address(this), IUSDName(address(nameNft)), IUSDResolver(address(resolver)));
        reserved = new ReservedNames(address(this));
        metadata = new USDMetadata(address(this), IUSDName(address(nameNft)));
        registrar = new USDRegistrar(
            IUSDName(address(nameNft)),
            IUSDResolver(address(resolver)),
            IReservedNames(address(reserved)),
            IERC20(token),
            address(this),
            treasury,
            address(this),
            exempt,
            USDTerms.DEFAULT_GRACE,
            true
        );
        nameNft.wire(address(registrar), address(resolver), address(reverseRegistrar), address(metadata));
        resolver.setRegistrar(address(registrar));
        reverseRegistrar.setRegistrar(address(registrar));
        reserved.setRegistrar(address(registrar));
        metadata.setRegistrar(address(registrar));
        registrar.closeSeed();
    }

    function _unpause() internal {
        registrar.setRegistrationPaused(false);
    }

    function _fund(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(registrar), type(uint256).max);
    }

    function _register(address payer, address recipient, string memory label, uint8 years_) internal {
        bytes32 secret = keccak256(abi.encodePacked("secret", label, payer, years_));
        bytes32 commitment = registrar.commitmentHash(label, recipient, years_, payer, secret);
        vm.prank(payer);
        registrar.commit(commitment);
        vm.warp(block.timestamp + USDTerms.MIN_COMMITMENT_AGE + 1);
        vm.prank(payer);
        registrar.reveal(label, recipient, years_, secret);
    }
}

contract YesReceiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract NoReceiver {}

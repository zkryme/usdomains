// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IReservedNames, IUSDName, IUSDResolver} from "../src/interfaces/IUSD.sol";
import {ReservedNames} from "../src/ReservedNames.sol";
import {USDMetadata} from "../src/USDMetadata.sol";
import {USDName} from "../src/USDName.sol";
import {USDTerms} from "../src/USDTerms.sol";
import {USDRegistrar} from "../src/USDRegistrar.sol";
import {USDResolver} from "../src/USDResolver.sol";
import {USDReverse} from "../src/USDReverse.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract USDHandler is Test {
    USDRegistrar public registrar;
    USDName public nameNft;
    USDResolver public resolver;
    USDReverse public reverseRegistrar;
    ReservedNames public reserved;
    USDMetadata public metadata;
    MockUSDC public usdc;
    uint256 public ghost;

    constructor() {
        usdc = new MockUSDC();
        nameNft = new USDName(address(this));
        resolver = new USDResolver(address(this), IUSDName(address(nameNft)));
        reverseRegistrar = new USDReverse(address(this), IUSDName(address(nameNft)), IUSDResolver(address(resolver)));
        reserved = new ReservedNames(address(this));
        metadata = new USDMetadata(address(this), IUSDName(address(nameNft)));
        registrar = new USDRegistrar(
            IUSDName(address(nameNft)),
            IUSDResolver(address(resolver)),
            IReservedNames(address(reserved)),
            IERC20(address(usdc)),
            address(this),
            address(this),
            address(this),
            address(0xEFEF),
            USDTerms.DEFAULT_GRACE,
            true
        );
        nameNft.wire(address(registrar), address(resolver), address(reverseRegistrar), address(metadata));
        resolver.setRegistrar(address(registrar));
        reverseRegistrar.setRegistrar(address(registrar));
        reserved.setRegistrar(address(registrar));
        metadata.setRegistrar(address(registrar));
        registrar.closeSeed();
        registrar.setRegistrationPaused(false);

        string[] memory labels = new string[](1);
        labels[0] = "circle";
        registrar.reserve(labels);

        usdc.mint(address(this), 1_000_000 * USDTerms.USDC_UNIT);
        usdc.approve(address(registrar), type(uint256).max);
    }

    function registerName(uint256 salt, uint8 years_) external {
        years_ = uint8(bound(years_, 1, 10));
        string memory label = string.concat("name", vm.toString(salt % 400));
        uint256 before = registrar.accountedBalance();
        try this.doRegister(label, years_) {
            ghost += registrar.accountedBalance() - before;
        } catch {}
    }

    function renewName(uint256 salt, uint8 years_) external {
        years_ = uint8(bound(years_, 1, 10));
        string memory label = string.concat("name", vm.toString(salt % 400));
        uint256 before = registrar.accountedBalance();
        try this.doRenew(label, years_) {
            ghost += registrar.accountedBalance() - before;
        } catch {}
    }

    function warpTime(uint256 delta) external {
        delta = bound(delta, 0, 200 days);
        vm.warp(block.timestamp + delta);
    }

    function doRegister(string calldata label, uint8 years_) external {
        require(msg.sender == address(this));
        bytes32 secret = keccak256(abi.encodePacked(label, years_, block.number));
        bytes32 commitment = registrar.commitmentHash(label, address(this), years_, address(this), secret);
        registrar.commit(commitment);
        vm.warp(block.timestamp + USDTerms.MIN_COMMITMENT_AGE + 1);
        registrar.reveal(label, address(this), years_, secret);
    }

    function doRenew(string calldata label, uint8 years_) external {
        require(msg.sender == address(this));
        registrar.renew(label, years_);
    }
}

contract USDInvariantTest is Test {
    USDHandler internal handler;

    function setUp() public {
        handler = new USDHandler();
        targetContract(address(handler));
        excludeContract(address(handler.registrar()));
        excludeContract(address(handler.nameNft()));
        excludeContract(address(handler.usdc()));
        excludeContract(address(handler.resolver()));
        excludeContract(address(handler.reverseRegistrar()));
        excludeContract(address(handler.reserved()));
        excludeContract(address(handler.metadata()));

        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = USDHandler.registerName.selector;
        selectors[1] = USDHandler.renewName.selector;
        selectors[2] = USDHandler.warpTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_feesMatchBalance() public view {
        assertEq(handler.registrar().accountedBalance(), handler.ghost());
        assertEq(handler.usdc().balanceOf(address(handler.registrar())), handler.ghost());
    }

    function invariant_reservedNameIsNeverActive() public view {
        assertFalse(handler.registrar().isActive(uint256(keccak256("circle"))));
    }

    function invariant_activeNameHasOneOwner() public view {
        for (uint256 i; i < 20; ++i) {
            string memory label = string.concat("name", _digits(i));
            uint256 tokenId = uint256(keccak256(bytes(label)));
            if (!handler.registrar().isActive(tokenId)) continue;
            assertTrue(handler.nameNft().ownerOf(tokenId) != address(0));
            assertEq(tokenId, uint256(keccak256(bytes(handler.nameNft().labelOf(tokenId)))));
        }
    }

    function _digits(uint256 i) internal pure returns (string memory) {
        if (i < 10) return string(bytes.concat(bytes1(uint8(48 + i))));
        return string(bytes.concat(bytes1(uint8(48 + i / 10)), bytes1(uint8(48 + (i % 10)))));
    }
}

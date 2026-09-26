// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LabelValidator} from "../src/libraries/LabelValidator.sol";
import {USDTerms} from "../src/USDTerms.sol";
import {USDName} from "../src/USDName.sol";
import {USDRegistrar} from "../src/USDRegistrar.sol";
import {USDResolver} from "../src/USDResolver.sol";
import {USDReverse} from "../src/USDReverse.sol";
import {USDTestBase, NoReceiver, YesReceiver} from "./Base.sol";
import {ReenteringUSDC} from "./mocks/ReenteringUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IReservedNames, IUSDName, IUSDResolver} from "../src/interfaces/IUSD.sol";

contract USDRegistrarTest is USDTestBase {
    function test_startsPaused_andRejectsCommit() public {
        assertTrue(registrar.registrationPaused());
        assertTrue(registrar.seedClosed());
        vm.expectRevert(USDRegistrar.RegistrationPaused.selector);
        registrar.commit(bytes32(uint256(1)));
    }

    function test_pricesUseSixDecimalUnits() public view {
        assertEq(registrar.annualPrice(3), 30 * USDTerms.USDC_UNIT);
        assertEq(registrar.annualPrice(4), 20 * USDTerms.USDC_UNIT);
        assertEq(registrar.annualPrice(5), 10 * USDTerms.USDC_UNIT);
        assertEq(registrar.annualPrice(32), 10 * USDTerms.USDC_UNIT);
        assertEq(registrar.quote("abc", 1), 30_000_000);
        assertEq(registrar.quote("abcd", 2), 40_000_000);
        assertEq(registrar.quote("abcde", 10), 100_000_000);
        assertTrue(registrar.quote("abc", 1) != 100 ether);
    }

    function test_invalidLabels() public view {
        assertEq(registrar.diagnoseLabel(""), LabelValidator.EMPTY);
        assertEq(registrar.diagnoseLabel("A"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel("Ab"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel("Abc"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel("ab"), LabelValidator.TOO_SHORT);
        assertEq(registrar.diagnoseLabel("a"), LabelValidator.TOO_SHORT);
        assertEq(registrar.diagnoseLabel("-ab"), LabelValidator.BAD_HYPHEN);
        assertEq(registrar.diagnoseLabel("ab-"), LabelValidator.BAD_HYPHEN);
        assertEq(registrar.diagnoseLabel("a--b"), LabelValidator.BAD_HYPHEN);
        assertEq(registrar.diagnoseLabel("ab c"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel("ab.c"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel("a_b"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel(unicode"abcü"), LabelValidator.BAD_CHAR);
        assertEq(registrar.diagnoseLabel(unicode"abc😀"), LabelValidator.BAD_CHAR);
        assertEq(
            registrar.diagnoseLabel("abcdefghijklmnopqrstuvwxyz0123456"),
            LabelValidator.TOO_LONG
        );
        assertEq(registrar.diagnoseLabel("abc"), LabelValidator.OK);
        assertEq(registrar.diagnoseLabel("a-b"), LabelValidator.OK);
        assertEq(registrar.diagnoseLabel("a-b-c"), LabelValidator.OK);
        assertEq(registrar.diagnoseLabel("123"), LabelValidator.OK);
    }

    function test_quoteRejectsInvalidLabelsAndDurations() public {
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        registrar.quote("Abc", 1);
        vm.expectRevert(LabelValidator.LabelTooShort.selector);
        registrar.quote("ab", 1);
        vm.expectRevert(LabelValidator.EmptyLabel.selector);
        registrar.quote("", 1);
        vm.expectRevert(USDRegistrar.InvalidDuration.selector);
        registrar.quote("abc", 0);
        vm.expectRevert(USDRegistrar.InvalidDuration.selector);
        registrar.quote("abc", 11);
    }

    function test_disallowedCharactersRevertOnEveryWritePath() public {
        _unpause();
        string memory emoji = unicode"abc😀";

        assertEq(registrar.quote("ab-c", 1), 20 * USDTerms.USDC_UNIT);

        vm.expectRevert(LabelValidator.InvalidHyphen.selector);
        registrar.quote("-abc", 1);
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        registrar.quote(emoji, 1);
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        registrar.quote("ABC", 1);

        vm.expectRevert(LabelValidator.InvalidHyphen.selector);
        registrar.reveal("abc-", alice, 1, bytes32(uint256(1)));
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        registrar.reveal(emoji, alice, 1, bytes32(uint256(1)));
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        registrar.renew("a_b", 1);

        string[] memory labels = new string[](1);
        labels[0] = "a--b";
        vm.expectRevert(LabelValidator.InvalidHyphen.selector);
        registrar.reserve(labels);
        labels[0] = emoji;
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        registrar.reserve(labels);

        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        resolver.setAddress(emoji, alice);
        vm.expectRevert(LabelValidator.InvalidCharacter.selector);
        resolver.setText("a_b", "url", "https://example.com");
        vm.expectRevert(LabelValidator.InvalidHyphen.selector);
        reverseRegistrar.setPrimary("-abc");
    }

    function testFuzz_alnumPrice(uint8 length, uint8 years_) public view {
        length = uint8(bound(length, 3, 32));
        years_ = uint8(bound(years_, 1, 10));
        string memory label = _letters(length);
        uint256 perYear = length == 3 ? 30 : length == 4 ? 20 : 10;
        assertEq(registrar.quote(label, years_), perYear * USDTerms.USDC_UNIT * years_);
    }

    function testFuzz_nonCanonicalReverts(bytes memory raw) public {
        vm.assume(raw.length < 40);
        string memory label = string(raw);
        if (LabelValidator.diagnose(label, 3) != LabelValidator.OK) {
            vm.expectRevert();
            registrar.quote(label, 1);
        }
    }

    function test_registerRenewTransferAndRecords() public {
        _unpause();
        _fund(alice, 1_000 * USDTerms.USDC_UNIT);
        uint256 cost = registrar.quote("alice", 1);
        uint256 before = usdc.balanceOf(alice);

        _register(alice, alice, "alice", 1);

        assertEq(usdc.balanceOf(alice), before - cost);
        assertEq(usdc.balanceOf(address(registrar)), cost);
        assertEq(registrar.accountedBalance(), cost);
        assertEq(nameNft.ownerOf(nameNftToken("alice")), alice);
        assertEq(nameNftToken("alice"), uint256(keccak256("alice")));

        vm.prank(alice);
        resolver.setAddress("alice", alice);
        assertEq(resolver.addrIfActive("alice"), alice);

        vm.prank(alice);
        resolver.setText("alice", "url", "https://alice.example");
        assertEq(resolver.textIfActive("alice", "url"), "https://alice.example");

        vm.prank(alice);
        reverseRegistrar.setPrimary("alice");
        (string memory primary, bool verified) = reverseRegistrar.reverse(alice);
        assertTrue(verified);
        assertEq(primary, "alice");

        vm.prank(bob);
        vm.expectRevert(USDResolver.NotManager.selector);
        resolver.setAddress("alice", bob);

        vm.prank(carol);
        vm.expectRevert();
        reverseRegistrar.setPrimary("alice");

        vm.prank(alice);
        nameNft.transferFrom(alice, bob, nameNftToken("alice"));
        assertEq(nameNft.ownerOf(nameNftToken("alice")), bob);

        (, bool aliceStill) = reverseRegistrar.reverse(alice);
        assertFalse(aliceStill);

        vm.prank(alice);
        vm.expectRevert(USDResolver.NotManager.selector);
        resolver.setAddress("alice", alice);

        vm.prank(bob);
        resolver.setAddress("alice", bob);
        vm.prank(bob);
        reverseRegistrar.setPrimary("alice");
        (, bool bobPrimary) = reverseRegistrar.reverse(bob);
        assertTrue(bobPrimary);

        _fund(carol, 100 * USDTerms.USDC_UNIT);
        vm.prank(carol);
        registrar.renew("alice", 1);
        assertEq(nameNft.ownerOf(nameNftToken("alice")), bob);
    }

    function test_duplicateRegistrationReverts() public {
        _unpause();
        _fund(alice, 500 * USDTerms.USDC_UNIT);
        _fund(bob, 500 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);

        bytes32 secret = keccak256("other");
        bytes32 commitment = registrar.commitmentHash("alice", bob, 1, bob, secret);
        vm.prank(bob);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(bob);
        vm.expectRevert(USDRegistrar.NameUnavailable.selector);
        registrar.reveal("alice", bob, 1, secret);
    }

    function test_commitmentReplayFrontRunAndExpiry() public {
        _unpause();
        _fund(alice, 500 * USDTerms.USDC_UNIT);
        _fund(bob, 500 * USDTerms.USDC_UNIT);

        bytes32 secret = keccak256("secret");
        bytes32 commitment = registrar.commitmentHash("alice", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);

        vm.prank(alice);
        vm.expectRevert(USDRegistrar.CommitmentTooNew.selector);
        registrar.reveal("alice", alice, 1, secret);

        vm.prank(bob);
        vm.expectRevert(USDRegistrar.CommitmentNotFound.selector);
        registrar.reveal("alice", bob, 1, secret);

        vm.prank(bob);
        vm.expectRevert(USDRegistrar.CommitmentNotFound.selector);
        registrar.reveal("alice", alice, 1, secret);

        vm.warp(block.timestamp + USDTerms.MAX_COMMITMENT_AGE + 1);
        vm.prank(alice);
        vm.expectRevert(USDRegistrar.CommitmentExpired.selector);
        registrar.reveal("alice", alice, 1, secret);

        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        registrar.reveal("alice", alice, 1, secret);

        vm.prank(alice);
        vm.expectRevert(USDRegistrar.CommitmentNotFound.selector);
        registrar.reveal("alice", alice, 1, secret);
    }

    function test_wrongResolverOrChainIsNotTheStoredCommitment() public view {
        bytes32 secret = keccak256("secret");
        bytes32 realHash = registrar.commitmentHash("alice", alice, 1, alice, secret);
        bytes32 otherResolver = keccak256(
            abi.encode("alice", alice, uint8(1), address(0x1234), alice, secret, block.chainid, address(registrar))
        );
        bytes32 otherChain = keccak256(
            abi.encode(
                "alice", alice, uint8(1), address(resolver), alice, secret, uint256(1), address(registrar)
            )
        );
        assertTrue(realHash != otherResolver);
        assertTrue(realHash != otherChain);
    }

    function test_priceChangeBetweenCommitAndReveal() public {
        _unpause();
        _fund(alice, 1_000 * USDTerms.USDC_UNIT);

        bytes32 secret = keccak256("price");
        bytes32 commitment = registrar.commitmentHash("alice", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);

        uint64 eta = uint64(block.timestamp + USDTerms.MIN_PRICE_DELAY);
        registrar.schedulePrice(5, 9 * USDTerms.USDC_UNIT, eta);
        assertEq(registrar.quote("alice", 1), 10 * USDTerms.USDC_UNIT);

        vm.warp(eta);
        assertEq(registrar.quote("alice", 1), 9 * USDTerms.USDC_UNIT);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        registrar.reveal("alice", alice, 1, secret);
        assertEq(before - usdc.balanceOf(alice), 9 * USDTerms.USDC_UNIT);
        assertEq(registrar.accountedBalance(), 9 * USDTerms.USDC_UNIT);
    }

    function test_priceDecreasePullsExactNewAmount() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        uint64 eta = uint64(block.timestamp + USDTerms.MIN_PRICE_DELAY);
        registrar.schedulePrice(5, 4 * USDTerms.USDC_UNIT, eta);

        bytes32 secret = keccak256("down");
        bytes32 commitment = registrar.commitmentHash("alice", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(eta);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        registrar.reveal("alice", alice, 1, secret);
        assertEq(before - usdc.balanceOf(alice), 4 * USDTerms.USDC_UNIT);
        assertEq(usdc.allowance(alice, address(registrar)), type(uint256).max);
    }

    function test_underpaymentAndShortTransferRevert() public {
        _unpause();
        uint256 cost = registrar.quote("alice", 1);
        usdc.mint(alice, cost - 1);
        vm.prank(alice);
        usdc.approve(address(registrar), type(uint256).max);

        bytes32 secret = keccak256("short");
        bytes32 commitment = registrar.commitmentHash("alice", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        vm.expectRevert();
        registrar.reveal("alice", alice, 1, secret);
    }

    function test_nativeValueRejected() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(registrar).call{value: 1}("");
        assertFalse(ok);
        vm.prank(alice);
        (bool okName,) = address(nameNft).call{value: 1}("");
        assertFalse(okName);
        assertEq(address(registrar).balance, 0);
    }

    function test_scheduleRejectsZeroPriceAndShortDelay() public {
        vm.expectRevert(USDRegistrar.PriceOutOfBounds.selector);
        registrar.schedulePrice(5, 0, uint64(block.timestamp + 2 days));
        vm.expectRevert(USDRegistrar.DelayTooShort.selector);
        registrar.schedulePrice(5, 6 * USDTerms.USDC_UNIT, uint64(block.timestamp + 1 hours));
        vm.expectRevert(USDRegistrar.GraceOutOfBounds.selector);
        registrar.scheduleGrace(1 days, uint64(block.timestamp + 8 days));
        vm.expectRevert(USDRegistrar.DelayTooShort.selector);
        registrar.scheduleGrace(14 days, uint64(block.timestamp + 1 days));
    }

    function test_graceRenewalExpiryAndReregistration() public {
        _unpause();
        _fund(alice, 1_000 * USDTerms.USDC_UNIT);
        _fund(bob, 1_000 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);

        vm.prank(alice);
        resolver.setAddress("alice", alice);
        vm.prank(alice);
        reverseRegistrar.setPrimary("alice");

        uint64 expiry = registrar.expiryOf(nameNftToken("alice"));
        vm.warp(expiry);
        USDRegistrar.Inspection memory duringGrace = registrar.inspect("alice");
        assertEq(uint8(duringGrace.availability), uint8(USDRegistrar.Availability.Grace));
        assertEq(resolver.addrIfActive("alice"), address(0));
        assertEq(resolver.addr(nameNftToken("alice")), alice);

        vm.prank(alice);
        resolver.setText("alice", "note", "still editable in grace");
        assertEq(resolver.text(nameNftToken("alice"), "note"), "still editable in grace");
        assertEq(resolver.textIfActive("alice", "note"), "");

        vm.prank(alice);
        vm.expectRevert(USDReverse.NotActive.selector);
        reverseRegistrar.setPrimary("alice");
        (, bool hidden) = reverseRegistrar.reverse(alice);
        assertFalse(hidden);

        uint256 renewAt = block.timestamp;
        vm.prank(bob);
        registrar.renew("alice", 1);
        assertEq(nameNft.ownerOf(nameNftToken("alice")), alice);
        assertEq(registrar.expiryOf(nameNftToken("alice")), uint64(renewAt + 365 days));
        assertEq(resolver.addrIfActive("alice"), alice);
        (, bool restored) = reverseRegistrar.reverse(alice);
        assertTrue(restored);

        uint64 secondExpiry = registrar.expiryOf(nameNftToken("alice"));
        (uint64 grace,,) = registrar.graceSchedule();
        vm.warp(uint256(secondExpiry) + grace);
        vm.prank(alice);
        vm.expectRevert(USDRegistrar.NameUnavailable.selector);
        registrar.renew("alice", 1);
        vm.prank(alice);
        vm.expectRevert(USDResolver.NotManager.selector);
        resolver.setAddress("alice", alice);

        vm.prank(alice);
        nameNft.transferFrom(alice, bob, nameNftToken("alice"));
        vm.prank(bob);
        vm.expectRevert(USDResolver.NotManager.selector);
        resolver.setAddress("alice", bob);
        vm.prank(bob);
        nameNft.transferFrom(bob, alice, nameNftToken("alice"));

        _register(bob, bob, "alice", 1);
        assertEq(nameNft.ownerOf(nameNftToken("alice")), bob);
        assertEq(resolver.addr(nameNftToken("alice")), address(0));
        assertEq(resolver.addrIfActive("alice"), address(0));
        (, bool aliceAfter) = reverseRegistrar.reverse(alice);
        assertFalse(aliceAfter);
        assertEq(resolver.text(nameNftToken("alice"), "note"), "");
    }

    function test_finalizeThenReserveBlocksReregistration() public {
        _unpause();
        _fund(alice, 200 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        uint64 expiry = registrar.expiryOf(nameNftToken("alice"));

        vm.warp(expiry + 1);
        vm.expectRevert(USDRegistrar.StillRenewable.selector);
        registrar.finalizeExpiry("alice");

        string[] memory labels = new string[](1);
        labels[0] = "alice";
        vm.expectRevert(abi.encodeWithSelector(USDRegistrar.NameStillRegistered.selector, "alice"));
        registrar.reserve(labels);

        vm.warp(uint256(expiry) + 30 days);
        registrar.finalizeExpiry("alice");
        assertFalse(nameNft.exists(nameNftToken("alice")));

        registrar.reserve(labels);
        _fund(bob, 200 * USDTerms.USDC_UNIT);
        bytes32 secret = keccak256("reserved-later");
        bytes32 commitment = registrar.commitmentHash("alice", bob, 1, bob, secret);
        vm.prank(bob);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(bob);
        vm.expectRevert(USDRegistrar.LabelReserved.selector);
        registrar.reveal("alice", bob, 1, secret);
    }

    function test_reservedNameBlockedOnReveal_andDirectMintBlocked() public {
        string[] memory labels = new string[](1);
        labels[0] = "circle";
        registrar.reserve(labels);

        _unpause();
        _fund(alice, 200 * USDTerms.USDC_UNIT);
        bytes32 secret = keccak256("circle");
        bytes32 commitment = registrar.commitmentHash("circle", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        vm.expectRevert(USDRegistrar.LabelReserved.selector);
        registrar.reveal("circle", alice, 1, secret);

        vm.expectRevert(USDName.OnlyRegistrar.selector);
        nameNft.mint(alice, uint256(keccak256("circle")), "circle");

        (bool promo,) = address(registrar).call(abi.encodeWithSignature("promoMint(string)", "circle"));
        (bool allow,) = address(registrar).call(abi.encodeWithSignature("allowlistMint(string,address)", "circle", alice));
        (bool free,) = address(registrar).call(abi.encodeWithSignature("freeMint(string)", "circle"));
        assertFalse(promo);
        assertFalse(allow);
        assertFalse(free);
    }

    function test_releaseLetsTheLabelBeRegistered() public {
        string[] memory labels = new string[](1);
        labels[0] = "circle";
        registrar.reserve(labels);
        registrar.release(labels);
        _unpause();
        _fund(alice, 200 * USDTerms.USDC_UNIT);
        _register(alice, alice, "circle", 1);
        assertEq(nameNft.ownerOf(nameNftToken("circle")), alice);
    }

    function test_pauseDoesNotBlockRenewTransferOrRecords() public {
        _unpause();
        _fund(alice, 500 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        registrar.setRegistrationPaused(true);

        vm.expectRevert(USDRegistrar.RegistrationPaused.selector);
        registrar.commit(bytes32(uint256(7)));

        vm.prank(alice);
        resolver.setAddress("alice", alice);
        vm.prank(alice);
        nameNft.transferFrom(alice, bob, nameNftToken("alice"));
        _fund(bob, 100 * USDTerms.USDC_UNIT);
        vm.prank(bob);
        registrar.renew("alice", 1);
        assertEq(nameNft.ownerOf(nameNftToken("alice")), bob);
    }

    function test_textLimitsAndOperator() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);

        vm.prank(alice);
        vm.expectRevert(USDResolver.InvalidKey.selector);
        resolver.setText("alice", "", "x");

        vm.prank(alice);
        vm.expectRevert(USDResolver.InvalidValue.selector);
        resolver.setText("alice", "k", _long(257));

        vm.prank(alice);
        nameNft.setApprovalForAll(bob, true);
        vm.prank(bob);
        resolver.setAddress("alice", bob);
        assertEq(resolver.addrIfActive("alice"), bob);
    }

    function test_maxTerm() public {
        _unpause();
        _fund(alice, 2_000 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 10);
        vm.prank(alice);
        vm.expectRevert(USDRegistrar.ExceedsMaxTerm.selector);
        registrar.renew("alice", 1);

        vm.warp(block.timestamp + 365 days);
        vm.prank(alice);
        registrar.renew("alice", 1);
    }

    function test_treasuryWithdrawalAndSurplus() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        uint256 collected = registrar.accountedBalance();

        vm.prank(bob);
        vm.expectRevert();
        registrar.withdraw(collected);

        registrar.withdraw(collected);
        assertEq(usdc.balanceOf(treasury), collected);
        assertEq(registrar.accountedBalance(), 0);

        usdc.mint(address(registrar), 3 * USDTerms.USDC_UNIT);
        registrar.withdrawSurplus();
        assertEq(usdc.balanceOf(treasury), collected + 3 * USDTerms.USDC_UNIT);
        assertEq(registrar.accountedBalance(), 0);
    }

    function test_setTreasuryRedirectsWithdrawal() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        address next = makeAddr("next-treasury");
        registrar.setTreasury(next);
        uint256 amount = registrar.accountedBalance();
        registrar.withdraw(amount);
        assertEq(usdc.balanceOf(next), amount);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_batchLimitAndCannotReserveActiveName() public {
        string[] memory tooMany = new string[](51);
        for (uint256 i; i < tooMany.length; ++i) {
            tooMany[i] = _letters(uint8(3 + (i % 20)));
        }
        vm.expectRevert(abi.encodeWithSelector(USDRegistrar.InvalidBatch.selector, 51));
        registrar.reserve(tooMany);

        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        string[] memory labels = new string[](1);
        labels[0] = "alice";
        vm.expectRevert(abi.encodeWithSelector(USDRegistrar.NameStillRegistered.selector, "alice"));
        registrar.reserve(labels);
    }

    function test_metadataIsNotOwnership() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        string memory body = metadata.json(nameNftToken("alice"));
        assertTrue(_contains(body, "alice.usd"));
        assertTrue(_contains(body, "not authoritative"));
        assertTrue(_contains(body, "active"));

        uint64 expiry = registrar.expiryOf(nameNftToken("alice"));
        vm.warp(expiry);
        assertTrue(_contains(metadata.json(nameNftToken("alice")), "grace - does not resolve"));

        vm.warp(uint256(expiry) + 30 days);
        registrar.finalizeExpiry("alice");
        vm.expectRevert();
        metadata.json(nameNftToken("alice"));
    }

    function test_contractRecipientMustAcceptERC721() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        NoReceiver no = new NoReceiver();
        bytes32 secret = keccak256("no");
        bytes32 commitment = registrar.commitmentHash("alice", address(no), 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        vm.expectRevert();
        registrar.reveal("alice", address(no), 1, secret);
        assertFalse(nameNft.exists(nameNftToken("alice")));

        YesReceiver yes = new YesReceiver();
        _register(alice, address(yes), "bobname", 1);
        assertEq(nameNft.ownerOf(nameNftToken("bobname")), address(yes));
    }

    function test_reentrancyCannotDoubleRegisterOrWithdraw() public {
        ReenteringUSDC token = new ReenteringUSDC();
        _deploy(address(token));
        _unpause();
        token.mint(alice, 1_000 * USDTerms.USDC_UNIT);
        vm.prank(alice);
        token.approve(address(registrar), type(uint256).max);

        bytes32 secret = keccak256("reenter");
        bytes32 commitment = registrar.commitmentHash("alice", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);

        token.arm(address(registrar), abi.encodeWithSelector(USDRegistrar.reveal.selector, "alice", alice, uint8(1), secret));
        vm.prank(alice);
        registrar.reveal("alice", alice, 1, secret);

        assertTrue(token.sawReenter());
        assertFalse(token.reenterSucceeded());
        assertEq(nameNft.ownerOf(nameNftToken("alice")), alice);
        assertEq(registrar.accountedBalance(), 10 * USDTerms.USDC_UNIT);
        assertEq(token.balanceOf(address(registrar)), registrar.accountedBalance());

        token.arm(address(registrar), abi.encodeWithSelector(USDRegistrar.withdraw.selector, registrar.accountedBalance()));
        registrar.withdraw(registrar.accountedBalance());
        assertTrue(token.sawReenter());
        assertFalse(token.reenterSucceeded());
        assertEq(registrar.accountedBalance(), 0);
        assertEq(token.balanceOf(treasury), 10 * USDTerms.USDC_UNIT);
    }

    function test_shortPaymentIsRejected() public {
        ReenteringUSDC token = new ReenteringUSDC();
        _deploy(address(token));
        token.setShortPay(true);
        _unpause();
        token.mint(alice, 100 * USDTerms.USDC_UNIT);
        vm.prank(alice);
        token.approve(address(registrar), type(uint256).max);

        bytes32 secret = keccak256("fee");
        bytes32 commitment = registrar.commitmentHash("alice", alice, 1, alice, secret);
        vm.prank(alice);
        registrar.commit(commitment);
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(USDRegistrar.PaymentMismatch.selector, 10 * USDTerms.USDC_UNIT, 10 * USDTerms.USDC_UNIT - 1));
        registrar.reveal("alice", alice, 1, secret);
    }

    function test_forwardSpoofDoesNotBecomePrimary() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        vm.prank(alice);
        resolver.setAddress("alice", carol);
        vm.prank(alice);
        vm.expectRevert(USDReverse.ForwardMismatch.selector);
        reverseRegistrar.setPrimary("alice");
        vm.prank(carol);
        vm.expectRevert();
        reverseRegistrar.setPrimary("alice");
        (, bool verified) = reverseRegistrar.reverse(carol);
        assertFalse(verified);
    }

    function test_expiredNameDoesNotResolveFromStoredRecord() public {
        _unpause();
        _fund(alice, 100 * USDTerms.USDC_UNIT);
        _register(alice, alice, "alice", 1);
        vm.prank(alice);
        resolver.setAddress("alice", alice);
        vm.warp(registrar.expiryOf(nameNftToken("alice")));
        assertEq(resolver.addrIfActive("alice"), address(0));
        assertTrue(resolver.addr(nameNftToken("alice")) == alice);
    }

    function nameNftToken(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    function _letters(uint256 length) internal pure returns (string memory) {
        bytes memory data = new bytes(length);
        for (uint256 i; i < length; ++i) {
            data[i] = bytes1(uint8(0x61 + (i % 26)));
        }
        return string(data);
    }

    function _long(uint256 length) internal pure returns (string memory) {
        bytes memory data = new bytes(length);
        for (uint256 i; i < length; ++i) data[i] = "a";
        return string(data);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i; i + n.length <= h.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}

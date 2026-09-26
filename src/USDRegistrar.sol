// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReservedNames, IUSDName, IUSDResolver} from "./interfaces/IUSD.sol";
import {USDTerms} from "./USDTerms.sol";
import {LabelValidator} from "./libraries/LabelValidator.sol";
import {RejectNativeValue} from "./RejectNativeValue.sol";

/// @title USDRegistrar
/// @notice Registration, renewal, pricing, and reservation entry point for `.usd` names.
///
/// @dev Payment route: Arc USDC ERC-20 interface only.
///      Official Arc documentation (stablecoin model, EVM differences, and contract addresses)
///      defines one USDC balance with two interfaces:
///        - native `msg.value` / `address.balance`: 18 decimals
///        - ERC-20 at 0x3600...0000: 6 decimals
///      These units differ by 1e12. This contract stores prices as 6-decimal ERC-20 base units
///      (1 USDC = 1_000_000) and pulls that exact amount with `transferFrom`.
///      Every state-changing function rejects native value. There is no conversion helper, because
///      using one would mix the units.
///
///      A year is 365 days. A registration action lasts 1 to 10 years. The resulting expiry cannot
///      be more than 10 years after the transaction. Renewal during the active term extends the
///      existing expiry. Renewal during grace starts a fresh term at `block.timestamp`, because the
///      grace gap is recovery time rather than prepaid use. Anyone may pay a renewal; payment does
///      not change the owner. Only the NFT owner or an approved operator can transfer the NFT or
///      edit records, and only while the name is active or in grace.
///
///      Commitments bind the canonical label, recipient, duration, resolver address, payer, secret,
///      chain id, and this registrar. Reveal must be sent by the bound payer. A copied reveal cannot
///      redirect the name.
///
///      There is no allowlist, discount, or free mint. `reveal` is the only registration path, and
///      it checks reservations before minting.
///
///      Contracts are not upgradeable. The admin can pause new registrations, schedule price and
///      grace changes, reserve unregistered labels, and change the treasury address. The admin
///      cannot seize, rewrite, or burn a name that is still active or in grace.
contract USDRegistrar is AccessControl, ReentrancyGuard, RejectNativeValue {
    using SafeERC20 for IERC20;

    uint256 public constant USDC_UNIT = USDTerms.USDC_UNIT;
    uint256 public constant MIN_COMMITMENT_AGE = USDTerms.MIN_COMMITMENT_AGE;
    uint256 public constant MAX_COMMITMENT_AGE = USDTerms.MAX_COMMITMENT_AGE;
    uint8 public constant MIN_YEARS = USDTerms.MIN_YEARS;
    uint8 public constant MAX_YEARS = USDTerms.MAX_YEARS;
    uint256 public constant YEAR = USDTerms.YEAR;
    uint64 public constant MIN_GRACE = USDTerms.MIN_GRACE;
    uint64 public constant MAX_GRACE = USDTerms.MAX_GRACE;
    uint64 public constant DEFAULT_GRACE = USDTerms.DEFAULT_GRACE;
    uint64 public constant MIN_PRICE_DELAY = USDTerms.MIN_PRICE_DELAY;
    uint64 public constant MIN_GRACE_DELAY = USDTerms.MIN_GRACE_DELAY;
    uint256 public constant MAX_BATCH = USDTerms.MAX_BATCH;
    uint256 public constant MAX_ANNUAL_PRICE = USDTerms.MAX_ANNUAL_PRICE;
    uint8 public constant ERC20_DECIMALS = USDTerms.ERC20_DECIMALS;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    enum Availability {
        Invalid,
        Available,
        Reserved,
        Active,
        Grace,
        Lapsed
    }

    struct Inspection {
        Availability availability;
        uint8 labelCode;
        bool reserved;
        address owner;
        uint64 expiry;
        uint64 graceEnds;
        uint256 annualPrice;
        bool registrationPaused;
    }

    struct PriceSchedule {
        uint256 current;
        uint256 pending;
        uint64 eta;
    }

    struct GraceSchedule {
        uint64 current;
        uint64 pending;
        uint64 eta;
    }

    error UnexpectedDecimals(uint8 actual);
    error ZeroAddress();
    error RegistrationPaused();
    error InvalidCommitment();
    error CommitmentExists();
    error CommitmentNotFound();
    error CommitmentTooNew();
    error CommitmentExpired();
    error InvalidDuration();
    error NameUnavailable();
    error LabelReserved();
    error NameStillRegistered(string label);
    error ExpiryNotFinalized(string label);
    error NotReserved(string label);
    error InvalidBatch(uint256 length);
    error ExceedsMaxTerm();
    error StillRenewable();
    error ZeroPrice();
    error PaymentMismatch(uint256 expected, uint256 received);
    error InvalidTier();
    error PriceOutOfBounds();
    error GraceOutOfBounds();
    error DelayTooShort();
    error InvalidWithdrawal();
    error SeedClosed();
    error Insolvency();
    error ReservationMissing(string label);
    error RegistrationsNotPaused();

    event CommitmentMade(bytes32 indexed commitment, address indexed payer);
    event NameRegistered(
        uint256 indexed tokenId,
        address indexed owner,
        address indexed payer,
        string label,
        uint64 expiry,
        uint8 durationYears,
        uint256 cost
    );
    event NameRenewed(uint256 indexed tokenId, address indexed payer, uint64 expiry, uint8 durationYears, uint256 cost);
    event NameFinalized(uint256 indexed tokenId, address indexed previousOwner, string label);
    event NameReserved(bytes32 indexed labelHash, string label, address indexed operator);
    event NameReleased(bytes32 indexed labelHash, string label, address indexed operator);
    event PriceChangeScheduled(uint8 indexed tier, uint256 price, uint64 eta);
    event PriceChangeApplied(uint8 indexed tier, uint256 price);
    event GraceChangeScheduled(uint64 gracePeriod, uint64 eta);
    event GraceChangeApplied(uint64 gracePeriod);
    event RegistrationPauseSet(bool paused);
    event TreasuryUpdated(address indexed treasury);
    event TreasuryWithdrawal(address indexed to, uint256 amount, address indexed caller);
    event SeedOperatorClosed(address indexed operator);
    event ReservationsConfirmed(uint256 count, address indexed caller);

    IUSDName public immutable nameContract;
    IUSDResolver public immutable resolverContract;
    IReservedNames public immutable reservedNames;
    IERC20 public immutable usdc;

    address public treasury;
    address public seedOperator;
    bool public seedClosed;
    bool public registrationPaused = true;
    uint256 public accountedBalance;

    mapping(bytes32 commitment => uint64 timestamp) public commitments;
    mapping(uint256 tokenId => uint64 expiry) public expiries;
    mapping(uint8 tier => PriceSchedule schedule) private _prices;
    GraceSchedule private _grace;

    constructor(
        IUSDName name_,
        IUSDResolver resolver_,
        IReservedNames reserved_,
        IERC20 usdc_,
        address admin_,
        address treasury_,
        address treasuryController_,
        uint64 gracePeriod_
    ) {
        if (
            address(name_) == address(0) || address(resolver_) == address(0) || address(reserved_) == address(0)
                || address(usdc_) == address(0) || admin_ == address(0) || treasury_ == address(0)
                || treasuryController_ == address(0)
        ) revert ZeroAddress();
        if (gracePeriod_ < MIN_GRACE || gracePeriod_ > MAX_GRACE) revert GraceOutOfBounds();

        uint8 decimals_ = IERC20Metadata(address(usdc_)).decimals();
        if (decimals_ != ERC20_DECIMALS) revert UnexpectedDecimals(decimals_);

        nameContract = name_;
        resolverContract = resolver_;
        reservedNames = reserved_;
        usdc = usdc_;
        treasury = treasury_;
        seedOperator = msg.sender;
        _grace.current = gracePeriod_;

        _prices[3].current = 30 * USDC_UNIT;
        _prices[4].current = 20 * USDC_UNIT;
        _prices[5].current = 10 * USDC_UNIT;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(TREASURY_ROLE, treasuryController_);

        emit RegistrationPauseSet(true);
        emit GraceChangeApplied(gracePeriod_);
        emit PriceChangeApplied(3, 30 * USDC_UNIT);
        emit PriceChangeApplied(4, 20 * USDC_UNIT);
        emit PriceChangeApplied(5, 10 * USDC_UNIT);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function diagnoseLabel(string calldata label) external pure returns (uint8) {
        return LabelValidator.diagnose(label, LabelValidator.MIN_PUBLIC_LENGTH);
    }

    function priceSchedule(uint8 tier) external view returns (uint256 current, uint256 pending, uint64 eta) {
        PriceSchedule storage schedule = _prices[tier];
        return (schedule.current, schedule.pending, schedule.eta);
    }

    function graceSchedule() external view returns (uint64 current, uint64 pending, uint64 eta) {
        return (_grace.current, _grace.pending, _grace.eta);
    }

    function annualPrice(uint256 length) public view returns (uint256) {
        return _effectiveAnnual(_tier(length));
    }

    function quote(string calldata label, uint8 years_) external view returns (uint256) {
        LabelValidator.requirePublic(label);
        _checkYears(years_);
        return annualPrice(bytes(label).length) * years_;
    }

    function isLabelReserved(string calldata label) external view returns (bool) {
        return reservedNames.isReserved(LabelValidator.hashOf(label));
    }

    function isActive(uint256 tokenId) public view returns (bool) {
        if (!nameContract.exists(tokenId)) return false;
        uint64 expiry = expiries[tokenId];
        return expiry != 0 && block.timestamp < expiry;
    }

    function inRenewalWindow(uint256 tokenId) public view returns (bool) {
        if (!nameContract.exists(tokenId)) return false;
        uint64 expiry = expiries[tokenId];
        if (expiry == 0) return false;
        return block.timestamp < uint256(expiry) + _effectiveGrace();
    }

    /// @notice 0 none, 1 active, 2 grace, 3 lapsed.
    function phase(uint256 tokenId) public view returns (uint8) {
        if (!nameContract.exists(tokenId)) return 0;
        uint64 expiry = expiries[tokenId];
        uint64 grace = _effectiveGrace();
        if (expiry == 0) return 3;
        if (block.timestamp < expiry) return 1;
        if (block.timestamp < uint256(expiry) + grace) return 2;
        return 3;
    }

    function expiryOf(uint256 tokenId) external view returns (uint64) {
        return expiries[tokenId];
    }

    function inspect(string calldata label) external view returns (Inspection memory info) {
        info.registrationPaused = registrationPaused;
        info.labelCode = LabelValidator.diagnose(label, LabelValidator.MIN_PUBLIC_LENGTH);
        if (info.labelCode != LabelValidator.OK) {
            info.availability = Availability.Invalid;
            return info;
        }

        info.annualPrice = annualPrice(bytes(label).length);
        bytes32 labelHash = LabelValidator.hashOf(label);
        info.reserved = reservedNames.isReserved(labelHash);
        uint256 tokenId = uint256(labelHash);

        if (!nameContract.exists(tokenId)) {
            info.availability = info.reserved ? Availability.Reserved : Availability.Available;
            return info;
        }

        info.owner = nameContract.ownerOf(tokenId);
        info.expiry = expiries[tokenId];
        info.graceEnds = uint64(uint256(info.expiry) + _effectiveGrace());
        uint8 currentPhase = phase(tokenId);
        if (currentPhase == 1) info.availability = Availability.Active;
        else if (currentPhase == 2) info.availability = Availability.Grace;
        else info.availability = Availability.Lapsed;
    }

    /// @notice Hash bound to the label, recipient, duration, resolver, payer, secret, chain, and registrar.
    function commitmentHash(string memory label, address recipient, uint8 years_, address payer, bytes32 secret)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                label, recipient, years_, address(resolverContract), payer, secret, block.chainid, address(this)
            )
        );
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    function commit(bytes32 commitment) external {
        if (registrationPaused) revert RegistrationPaused();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        uint64 existing = commitments[commitment];
        if (existing != 0 && block.timestamp <= existing + MAX_COMMITMENT_AGE) revert CommitmentExists();

        commitments[commitment] = uint64(block.timestamp);
        emit CommitmentMade(commitment, msg.sender);
    }

    function reveal(string calldata label, address recipient, uint8 years_, bytes32 secret) external nonReentrant {
        if (registrationPaused) revert RegistrationPaused();
        LabelValidator.requirePublic(label);
        _checkYears(years_);
        if (recipient == address(0)) revert ZeroAddress();

        bytes32 commitment = commitmentHash(label, recipient, years_, msg.sender, secret);
        uint64 committedAt = commitments[commitment];
        if (committedAt == 0) revert CommitmentNotFound();
        if (block.timestamp < committedAt + MIN_COMMITMENT_AGE) revert CommitmentTooNew();
        if (block.timestamp > committedAt + MAX_COMMITMENT_AGE) revert CommitmentExpired();

        bytes32 labelHash = LabelValidator.hashOf(label);
        if (reservedNames.isReserved(labelHash)) revert LabelReserved();

        uint256 tokenId = uint256(labelHash);
        bool exists = nameContract.exists(tokenId);
        if (exists) {
            _applyGrace();
            if (inRenewalWindow(tokenId)) revert NameUnavailable();
        }

        delete commitments[commitment];

        if (exists) {
            address previousOwner = nameContract.ownerOf(tokenId);
            delete expiries[tokenId];
            nameContract.burn(tokenId);
            emit NameFinalized(tokenId, previousOwner, label);
        }

        uint64 newExpiry = uint64(block.timestamp + uint256(years_) * YEAR);
        expiries[tokenId] = newExpiry;
        uint256 cost = _charge(bytes(label).length, years_);
        nameContract.mint(recipient, tokenId, label);

        emit NameRegistered(tokenId, recipient, msg.sender, label, newExpiry, years_, cost);
    }

    /// @notice Extends a name that is active or in grace. Anyone may pay. The owner does not change.
    function renew(string calldata label, uint8 years_) external nonReentrant {
        LabelValidator.requirePublic(label);
        _checkYears(years_);

        uint256 tokenId = LabelValidator.idOf(label);
        if (!nameContract.exists(tokenId)) revert NameUnavailable();
        _applyGrace();
        if (!inRenewalWindow(tokenId)) revert NameUnavailable();

        uint64 newExpiry = _extendedExpiry(expiries[tokenId], years_);
        expiries[tokenId] = newExpiry;
        uint256 cost = _charge(bytes(label).length, years_);

        emit NameRenewed(tokenId, msg.sender, newExpiry, years_, cost);
    }

    /// @notice Burns a name whose grace period has ended and clears its resolver and reverse records.
    ///         This is permissionless cleanup, not an administrator seizure. It cannot succeed while
    ///         the current registrant can still renew.
    function finalizeExpiry(string calldata label) external nonReentrant {
        LabelValidator.requirePublic(label);
        uint256 tokenId = LabelValidator.idOf(label);
        if (!nameContract.exists(tokenId)) revert NameUnavailable();
        _applyGrace();
        if (inRenewalWindow(tokenId)) revert StillRenewable();

        address previousOwner = nameContract.ownerOf(tokenId);
        delete expiries[tokenId];
        nameContract.burn(tokenId);
        emit NameFinalized(tokenId, previousOwner, label);
    }

    // ---------------------------------------------------------------------
    // Reservations
    // ---------------------------------------------------------------------

    function reserve(string[] calldata labels) external onlyRole(ADMIN_ROLE) {
        _reserve(labels);
    }

    /// @notice Deployment-only reservation path. It cannot mint. The deployer closes it before public use.
    function seedReservations(string[] calldata labels) external {
        if (seedClosed || msg.sender != seedOperator) revert SeedClosed();
        _reserve(labels);
    }

    function closeSeed() external {
        if (seedClosed || msg.sender != seedOperator) revert SeedClosed();
        if (!registrationPaused) revert RegistrationsNotPaused();
        seedClosed = true;
        emit SeedOperatorClosed(seedOperator);
        seedOperator = address(0);
    }

    /// @notice Reverts unless every supplied label is reserved. Used by deployment to confirm the seed.
    function confirmReservations(string[] calldata labels) external {
        uint256 length = labels.length;
        if (length == 0 || length > MAX_BATCH) revert InvalidBatch(length);
        for (uint256 i; i < length; ++i) {
            if (!reservedNames.isReserved(LabelValidator.hashOf(labels[i]))) revert ReservationMissing(labels[i]);
        }
        emit ReservationsConfirmed(length, msg.sender);
    }

    function release(string[] calldata labels) external onlyRole(ADMIN_ROLE) {
        uint256 length = labels.length;
        if (length == 0 || length > MAX_BATCH) revert InvalidBatch(length);

        for (uint256 i; i < length; ++i) {
            LabelValidator.requireReservable(labels[i]);
            bytes32 labelHash = LabelValidator.hashOf(labels[i]);
            if (!reservedNames.clearIfSet(labelHash)) revert NotReserved(labels[i]);
            emit NameReleased(labelHash, labels[i], msg.sender);
        }
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    function setRegistrationPaused(bool paused) external onlyRole(ADMIN_ROLE) {
        registrationPaused = paused;
        emit RegistrationPauseSet(paused);
    }

    function schedulePrice(uint8 tier, uint256 newPrice, uint64 eta) external onlyRole(ADMIN_ROLE) {
        if (tier != 3 && tier != 4 && tier != 5) revert InvalidTier();
        if (newPrice == 0 || newPrice > MAX_ANNUAL_PRICE) revert PriceOutOfBounds();
        if (eta < block.timestamp + MIN_PRICE_DELAY) revert DelayTooShort();

        _applyPrice(tier);
        _prices[tier].pending = newPrice;
        _prices[tier].eta = eta;
        emit PriceChangeScheduled(tier, newPrice, eta);
    }

    function scheduleGrace(uint64 newGrace, uint64 eta) external onlyRole(ADMIN_ROLE) {
        if (newGrace < MIN_GRACE || newGrace > MAX_GRACE) revert GraceOutOfBounds();
        if (eta < block.timestamp + MIN_GRACE_DELAY) revert DelayTooShort();

        _applyGrace();
        _grace.pending = newGrace;
        _grace.eta = eta;
        emit GraceChangeScheduled(newGrace, eta);
    }

    function applyScheduled() external {
        _applyGrace();
        _applyPrice(3);
        _applyPrice(4);
        _applyPrice(5);
    }

    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Sends collected registration fees to the treasury. `amount` is a 6-decimal ERC-20 quantity.
    function withdraw(uint256 amount) external onlyRole(TREASURY_ROLE) nonReentrant {
        if (amount == 0 || amount > accountedBalance) revert InvalidWithdrawal();
        accountedBalance -= amount;
        usdc.safeTransfer(treasury, amount);
        emit TreasuryWithdrawal(treasury, amount, msg.sender);
    }

    /// @notice Sends ERC-20 USDC that arrived outside registration accounting. Native dust below 1e-6 USDC
    ///         is not represented by `balanceOf` and is not swept.
    function withdrawSurplus() external onlyRole(TREASURY_ROLE) nonReentrant {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance < accountedBalance) revert Insolvency();
        uint256 surplus = balance - accountedBalance;
        if (surplus == 0) revert InvalidWithdrawal();
        usdc.safeTransfer(treasury, surplus);
        emit TreasuryWithdrawal(treasury, surplus, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _reserve(string[] calldata labels) internal {
        uint256 length = labels.length;
        if (length == 0 || length > MAX_BATCH) revert InvalidBatch(length);

        for (uint256 i; i < length; ++i) {
            LabelValidator.requireReservable(labels[i]);
            bytes32 labelHash = LabelValidator.hashOf(labels[i]);
            uint256 tokenId = uint256(labelHash);
            if (nameContract.exists(tokenId)) {
                _applyGrace();
                if (inRenewalWindow(tokenId)) revert NameStillRegistered(labels[i]);
                revert ExpiryNotFinalized(labels[i]);
            }
            if (reservedNames.setIfNew(labelHash)) emit NameReserved(labelHash, labels[i], msg.sender);
        }
    }

    function _charge(uint256 length, uint8 years_) internal returns (uint256 cost) {
        uint8 tier = _tier(length);
        _applyPrice(tier);
        cost = _prices[tier].current * years_;
        if (cost == 0) revert ZeroPrice();

        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), cost);
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        if (received != cost) revert PaymentMismatch(cost, received);
        accountedBalance += cost;
    }

    function _extendedExpiry(uint64 expiry, uint8 years_) internal view returns (uint64) {
        uint256 base = block.timestamp < expiry ? uint256(expiry) : block.timestamp;
        uint256 next = base + uint256(years_) * YEAR;
        if (next > block.timestamp + uint256(MAX_YEARS) * YEAR) revert ExceedsMaxTerm();
        return uint64(next);
    }

    function _checkYears(uint8 years_) internal pure {
        if (years_ < MIN_YEARS || years_ > MAX_YEARS) revert InvalidDuration();
    }

    function _tier(uint256 length) internal pure returns (uint8) {
        if (length == 3) return 3;
        if (length == 4) return 4;
        if (length >= 5 && length <= LabelValidator.MAX_LENGTH) return 5;
        revert LabelValidator.LabelTooShort();
    }

    function _effectiveAnnual(uint8 tier) internal view returns (uint256) {
        PriceSchedule storage schedule = _prices[tier];
        if (schedule.eta != 0 && block.timestamp >= schedule.eta) return schedule.pending;
        return schedule.current;
    }

    function _effectiveGrace() internal view returns (uint64) {
        if (_grace.eta != 0 && block.timestamp >= _grace.eta) return _grace.pending;
        return _grace.current;
    }

    function _applyPrice(uint8 tier) internal {
        PriceSchedule storage schedule = _prices[tier];
        if (schedule.eta != 0 && block.timestamp >= schedule.eta) {
            schedule.current = schedule.pending;
            schedule.pending = 0;
            schedule.eta = 0;
            emit PriceChangeApplied(tier, schedule.current);
        }
    }

    function _applyGrace() internal {
        if (_grace.eta != 0 && block.timestamp >= _grace.eta) {
            _grace.current = _grace.pending;
            _grace.pending = 0;
            _grace.eta = 0;
            emit GraceChangeApplied(_grace.current);
        }
    }
}

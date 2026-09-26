// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Registration terms shared by the registrar, deployer, and tests.
library USDTerms {
    uint256 internal constant USDC_UNIT = 1_000_000;
    uint256 internal constant MIN_COMMITMENT_AGE = 60;
    uint256 internal constant MAX_COMMITMENT_AGE = 1 days;
    uint8 internal constant MIN_YEARS = 1;
    uint8 internal constant MAX_YEARS = 10;
    uint256 internal constant YEAR = 365 days;
    uint64 internal constant MIN_GRACE = 7 days;
    uint64 internal constant MAX_GRACE = 90 days;
    uint64 internal constant DEFAULT_GRACE = 30 days;
    uint64 internal constant MIN_PRICE_DELAY = 1 days;
    uint64 internal constant MIN_GRACE_DELAY = 7 days;
    uint256 internal constant MAX_BATCH = 50;
    uint256 internal constant MAX_ANNUAL_PRICE = 100_000 * USDC_UNIT;
    uint8 internal constant ERC20_DECIMALS = 6;
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Canonical `.usd` label rules for v1.
/// @dev A label is lowercase ASCII `a-z`, digits `0-9`, and a single hyphen between
///      other characters. The contract does not lowercase, strip, or fold input.
///      Uppercase, leading or trailing hyphens, repeated hyphens, spaces, punctuation,
///      emoji, and any other byte revert on every public path: quote, reveal, renewal,
///      records, and reservation. The UI may lowercase before submission, but a direct
///      call with any other character still reverts.
library LabelValidator {
    uint256 internal constant MIN_PUBLIC_LENGTH = 3;
    uint256 internal constant MIN_RESERVABLE_LENGTH = 1;
    uint256 internal constant MAX_LENGTH = 32;

    uint8 internal constant OK = 0;
    uint8 internal constant EMPTY = 1;
    uint8 internal constant TOO_SHORT = 2;
    uint8 internal constant TOO_LONG = 3;
    uint8 internal constant BAD_CHAR = 4;
    uint8 internal constant BAD_HYPHEN = 5;

    error EmptyLabel();
    error LabelTooShort();
    error LabelTooLong();
    error InvalidCharacter();
    error InvalidHyphen();

    function diagnose(string memory label, uint256 minLength) internal pure returns (uint8) {
        bytes memory data = bytes(label);
        uint256 len = data.length;
        if (len == 0) return EMPTY;

        bool previousHyphen = false;
        for (uint256 i; i < len; ++i) {
            bytes1 char = data[i];
            bool hyphen = char == 0x2d;
            bool digit = char >= 0x30 && char <= 0x39;
            bool lower = char >= 0x61 && char <= 0x7a;
            if (hyphen) {
                if (i == 0 || i + 1 == len || previousHyphen) return BAD_HYPHEN;
            } else if (!digit && !lower) {
                return BAD_CHAR;
            }
            previousHyphen = hyphen;
        }

        if (len < minLength) return TOO_SHORT;
        if (len > MAX_LENGTH) return TOO_LONG;
        return OK;
    }

    function requirePublic(string memory label) internal pure {
        _require(diagnose(label, MIN_PUBLIC_LENGTH));
    }

    function requireReservable(string memory label) internal pure {
        _require(diagnose(label, MIN_RESERVABLE_LENGTH));
    }

    function hashOf(string memory label) internal pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    function idOf(string memory label) internal pure returns (uint256) {
        return uint256(hashOf(label));
    }

    function _require(uint8 code) private pure {
        if (code == OK) return;
        if (code == EMPTY) revert EmptyLabel();
        if (code == TOO_SHORT) revert LabelTooShort();
        if (code == TOO_LONG) revert LabelTooLong();
        if (code == BAD_CHAR) revert InvalidCharacter();
        revert InvalidHyphen();
    }
}

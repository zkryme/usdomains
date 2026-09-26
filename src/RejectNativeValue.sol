// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Rejects native-value transfers.
/// @dev On Arc, native value is USDC at 18 decimals and shares a balance with the 6-decimal ERC-20
///      interface. These contracts charge only through the ERC-20 interface and must not accept
///      `msg.value`, or the two units would be mixed.
abstract contract RejectNativeValue {
    error NativeValueNotAccepted();

    receive() external payable {
        revert NativeValueNotAccepted();
    }

    fallback() external payable {
        revert NativeValueNotAccepted();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockUSDC} from "./MockUSDC.sol";

/// @notice USDC stand-in that can reenter or under-deliver during transferFrom.
contract ReenteringUSDC is MockUSDC {
    address public target;
    bytes public payload;
    bool public armed;
    bool public sawReenter;
    bool public reenterSucceeded;
    bool public shortPay;

    function setShortPay(bool value) external {
        shortPay = value;
    }

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
        sawReenter = false;
        reenterSucceeded = false;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        _attack();
        return ok;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 sent = shortPay && amount > 0 ? amount - 1 : amount;
        bool ok = super.transferFrom(from, to, sent);
        _attack();
        return ok;
    }

    function _attack() internal {
        if (!armed) return;
        armed = false;
        sawReenter = true;
        (reenterSucceeded,) = target.call(payload);
    }
}

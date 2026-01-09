// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IInterchainGasPaymaster } from "@hyperlane-xyz/core/contracts/interfaces/IInterchainGasPaymaster.sol";

/// @title MockInterchainGasPaymaster
/// @notice Mock Hyperlane InterchainGasPaymaster for testing
contract MockInterchainGasPaymaster is IInterchainGasPaymaster {
    /// @notice Fixed gas price per gas unit (in wei)
    uint256 public gasPrice = 1 gwei;

    /// @notice Track payments for assertions
    mapping(bytes32 => uint256) public payments;

    function payForGas(bytes32 _messageId, uint32, uint256 _gasAmount, address _refundAddress) external payable {
        uint256 requiredPayment = _gasAmount * gasPrice;
        require(msg.value >= requiredPayment, "MockIGP: insufficient payment");

        payments[_messageId] = msg.value;

        emit GasPayment(_messageId, _gasAmount, msg.value);

        // Refund excess
        uint256 excess = msg.value - requiredPayment;
        if (excess > 0) {
            (bool success,) = _refundAddress.call{ value: excess }("");
            require(success, "MockIGP: refund failed");
        }
    }

    function quoteGasPayment(uint32, uint256 _gasAmount) external view returns (uint256) {
        return _gasAmount * gasPrice;
    }

    // Test helper to set gas price
    function setGasPrice(uint256 _gasPrice) external {
        gasPrice = _gasPrice;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import { IInterchainSecurityModule } from "@hyperlane-xyz/core/contracts/interfaces/IInterchainSecurityModule.sol";

/// @title MockMailbox
/// @notice Mock Hyperlane Mailbox for testing
contract MockMailbox is IMailbox {
    uint32 public localDomain;
    uint32 public messageCount;
    bytes32 public lastMessageId;
    mapping(bytes32 => bool) public deliveredMessages;

    // Store last dispatched message for assertions
    uint32 public lastDestination;
    bytes32 public lastRecipient;
    bytes public lastMessage;

    constructor(uint32 _localDomain) {
        localDomain = _localDomain;
    }

    function dispatch(uint32 _destinationDomain, bytes32 _recipientAddress, bytes calldata _messageBody)
        external
        returns (bytes32)
    {
        lastDestination = _destinationDomain;
        lastRecipient = _recipientAddress;
        lastMessage = _messageBody;

        messageCount++;
        lastMessageId = keccak256(abi.encodePacked(messageCount, _destinationDomain, _recipientAddress, _messageBody));

        emit Dispatch(msg.sender, _destinationDomain, _recipientAddress, _messageBody);
        emit DispatchId(lastMessageId);

        return lastMessageId;
    }

    function process(bytes calldata, bytes calldata) external pure {
        revert("MockMailbox: process not implemented");
    }

    function delivered(bytes32 messageId) external view returns (bool) {
        return deliveredMessages[messageId];
    }

    function defaultIsm() external pure returns (IInterchainSecurityModule) {
        return IInterchainSecurityModule(address(0));
    }

    function count() external view returns (uint32) {
        return messageCount;
    }

    function root() external pure returns (bytes32) {
        return bytes32(0);
    }

    function latestCheckpoint() external pure returns (bytes32, uint32) {
        return (bytes32(0), 0);
    }

    function recipientIsm(address) external pure returns (IInterchainSecurityModule) {
        return IInterchainSecurityModule(address(0));
    }

    // Helper to simulate receiving a message
    function simulateReceive(address recipient, uint32 origin, bytes32 sender, bytes calldata messageBody) external {
        bytes32 messageId = keccak256(abi.encodePacked(origin, sender, messageBody));
        deliveredMessages[messageId] = true;

        // Call the recipient's handle function
        (bool success,) =
            recipient.call(abi.encodeWithSignature("handle(uint32,bytes32,bytes)", origin, sender, messageBody));
        require(success, "MockMailbox: handle failed");

        emit Process(origin, sender, recipient);
        emit ProcessId(messageId);
    }
}

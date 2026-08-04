// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import { IInterchainSecurityModule } from "@hyperlane-xyz/core/contracts/interfaces/IInterchainSecurityModule.sol";
import { IPostDispatchHook } from "@hyperlane-xyz/core/contracts/interfaces/hooks/IPostDispatchHook.sol";
import { StandardHookMetadata } from "@hyperlane-xyz/core/contracts/hooks/libs/StandardHookMetadata.sol";

/// @title MockMailbox
/// @notice Mock Hyperlane v3+ Mailbox for testing
/// @dev Models the parts of v3 that the adapter actually depends on:
///      - `dispatch` is payable and reverts when underpaid, the way a real mailbox does once its
///        default post-dispatch hook (the IGP) is invoked. The previous v2-shaped mock accepted a
///        zero-value dispatch, which is precisely why the v2/v3 mismatch went unnoticed.
///      - `quoteDispatch` prices the gas limit carried in StandardHookMetadata, so a test can
///        observe the quote scaling with the payload.
contract MockMailbox is IMailbox {
    /// @notice Simulated destination gas price used to price quotes
    uint256 public gasPrice = 1 gwei;

    /// @notice Flat protocol fee added to every quote, mirroring the v3 required hook
    uint256 public protocolFee;

    uint32 public localDomain;
    uint32 public messageCount;
    bytes32 public lastMessageId;
    mapping(bytes32 => bool) public deliveredMessages;

    // Store last dispatched message for assertions
    uint32 public lastDestination;
    bytes32 public lastRecipient;
    bytes public lastMessage;
    bytes public lastMetadata;
    uint256 public lastValue;

    constructor(uint32 _localDomain) {
        localDomain = _localDomain;
    }

    // ─── v3 dispatch / quote ────────────────────────────────────────────────

    function dispatch(uint32 _destinationDomain, bytes32 _recipientAddress, bytes calldata _messageBody)
        external
        payable
        returns (bytes32)
    {
        return _dispatch(_destinationDomain, _recipientAddress, _messageBody, "");
    }

    function dispatch(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        bytes calldata _messageBody,
        bytes calldata _metadata
    ) external payable returns (bytes32) {
        return _dispatch(_destinationDomain, _recipientAddress, _messageBody, _metadata);
    }

    function dispatch(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        bytes calldata _messageBody,
        bytes calldata _metadata,
        IPostDispatchHook
    ) external payable returns (bytes32) {
        return _dispatch(_destinationDomain, _recipientAddress, _messageBody, _metadata);
    }

    function quoteDispatch(uint32, bytes32, bytes calldata) external view returns (uint256) {
        return _quote("");
    }

    function quoteDispatch(uint32, bytes32, bytes calldata, bytes calldata _metadata) external view returns (uint256) {
        return _quote(_metadata);
    }

    function quoteDispatch(uint32, bytes32, bytes calldata, bytes calldata _metadata, IPostDispatchHook)
        external
        view
        returns (uint256)
    {
        return _quote(_metadata);
    }

    // ─── v3 accessors ───────────────────────────────────────────────────────

    function process(bytes calldata, bytes calldata) external payable {
        revert("MockMailbox: process not implemented");
    }

    function delivered(bytes32 messageId) external view returns (bool) {
        return deliveredMessages[messageId];
    }

    function defaultIsm() external pure returns (IInterchainSecurityModule) {
        return IInterchainSecurityModule(address(0));
    }

    function defaultHook() external pure returns (IPostDispatchHook) {
        return IPostDispatchHook(address(0));
    }

    function requiredHook() external pure returns (IPostDispatchHook) {
        return IPostDispatchHook(address(0));
    }

    function latestDispatchedId() external view returns (bytes32) {
        return lastMessageId;
    }

    function nonce() external view returns (uint32) {
        return messageCount;
    }

    function recipientIsm(address) external pure returns (IInterchainSecurityModule) {
        return IInterchainSecurityModule(address(0));
    }

    // ─── test helpers ───────────────────────────────────────────────────────

    /// @notice Set the simulated destination gas price
    function setGasPrice(uint256 _gasPrice) external {
        gasPrice = _gasPrice;
    }

    /// @notice Set a flat protocol fee added to every quote
    function setProtocolFee(uint256 _protocolFee) external {
        protocolFee = _protocolFee;
    }

    /// @notice Gas limit the mailbox read out of the last dispatch's metadata
    function lastGasLimit() external view returns (uint256) {
        return StandardHookMetadata.gasLimit(lastMetadata);
    }

    /// @notice Simulate delivery of a message to a local recipient
    function simulateReceive(address recipient, uint32 origin, bytes32 sender, bytes calldata messageBody) external {
        // Align with dispatch() pattern - include messageCount for consistent ID generation
        messageCount++;
        bytes32 messageId = keccak256(abi.encodePacked(messageCount, origin, sender, messageBody));
        deliveredMessages[messageId] = true;

        // Call the recipient's handle function
        (bool success, bytes memory returnData) =
            recipient.call(abi.encodeWithSignature("handle(uint32,bytes32,bytes)", origin, sender, messageBody));

        // Forward the actual revert reason for better test debugging
        if (!success) {
            if (returnData.length > 0) {
                // Forward the actual revert data
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
            revert("MockMailbox: handle failed");
        }

        emit Process(origin, sender, recipient);
        emit ProcessId(messageId);
    }

    // ─── internals ──────────────────────────────────────────────────────────

    /// @dev `StandardHookMetadata.gasLimit(bytes memory)` falls back to 50_000 for empty metadata,
    ///      matching how a real mailbox prices a dispatch with no metadata override.
    function _quote(bytes memory _metadata) internal view returns (uint256) {
        return protocolFee + (StandardHookMetadata.gasLimit(_metadata) * gasPrice);
    }

    function _dispatch(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        bytes memory _messageBody,
        bytes memory _metadata
    ) internal returns (bytes32) {
        // A real v3 mailbox forwards msg.value to its hooks, which revert when underpaid.
        require(msg.value >= _quote(_metadata), "MockMailbox: insufficient payment");

        lastDestination = _destinationDomain;
        lastRecipient = _recipientAddress;
        lastMessage = _messageBody;
        lastMetadata = _metadata;
        lastValue = msg.value;

        messageCount++;
        lastMessageId = keccak256(abi.encodePacked(messageCount, _destinationDomain, _recipientAddress, _messageBody));

        emit Dispatch(msg.sender, _destinationDomain, _recipientAddress, _messageBody);
        emit DispatchId(lastMessageId);

        return lastMessageId;
    }
}

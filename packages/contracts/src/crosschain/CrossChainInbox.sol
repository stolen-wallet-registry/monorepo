// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ICrossChainInbox } from "../interfaces/ICrossChainInbox.sol";
import { IRegistryHub } from "../interfaces/IRegistryHub.sol";
import { IMessageRecipient } from "@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title CrossChainInbox
/// @author Stolen Wallet Registry Team
/// @notice Hub chain message receiver for cross-chain registrations
/// @dev Implements Hyperlane's IMessageRecipient to receive messages from spoke chains.
///      Validates trusted sources and routes registrations to RegistryHub.
contract CrossChainInbox is IMessageRecipient, ICrossChainInbox, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Bridge ID for Hyperlane (BridgeId.HYPERLANE = 1)
    uint8 public constant BRIDGE_ID = 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hyperlane mailbox contract address
    address public immutable mailbox;

    /// @inheritdoc ICrossChainInbox
    address public immutable registryHub;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Mapping of chainId => spokeRegistry => trusted status
    mapping(uint32 => mapping(bytes32 => bool)) private _trustedSources;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the CrossChainInbox
    /// @param _mailbox Hyperlane mailbox contract address
    /// @param _registryHub RegistryHub contract address on this chain
    /// @param _owner Initial owner address
    constructor(address _mailbox, address _registryHub, address _owner) Ownable(_owner) {
        if (_owner == address(0)) revert CrossChainInbox__ZeroAddress();
        if (_mailbox == address(0)) revert CrossChainInbox__ZeroAddress();
        if (_registryHub == address(0)) revert CrossChainInbox__ZeroAddress();
        mailbox = _mailbox;
        registryHub = _registryHub;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Restricts function to Hyperlane mailbox only
    modifier onlyMailbox() {
        _requireMailbox();
        _;
    }

    function _requireMailbox() internal view {
        if (msg.sender != mailbox) revert CrossChainInbox__OnlyBridge();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HYPERLANE MESSAGE RECIPIENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Handle incoming cross-chain message from Hyperlane
    /// @dev Only callable by Hyperlane mailbox. Validates source and routes to RegistryHub based on message type.
    /// @param _origin Origin chain domain ID
    /// @param _sender Sender address on origin chain (bytes32)
    /// @param _messageBody Encoded payload (wallet registration or transaction batch)
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _messageBody) external onlyMailbox {
        // Validate source is trusted
        if (!_trustedSources[_origin][_sender]) {
            revert CrossChainInbox__UntrustedSource();
        }

        // Generate message ID from payload hash
        bytes32 messageId = keccak256(_messageBody);

        // Extract message type to determine routing
        bytes1 msgType = CrossChainMessage.getMessageType(_messageBody);

        if (msgType == CrossChainMessage.MSG_TYPE_REGISTRATION) {
            // Wallet registration flow
            _handleWalletRegistration(_origin, _messageBody, messageId);
        } else if (msgType == CrossChainMessage.MSG_TYPE_TRANSACTION_BATCH) {
            // Transaction batch flow
            _handleTransactionBatch(_origin, _messageBody, messageId);
        } else {
            revert CrossChainInbox__UnknownMessageType();
        }
    }

    /// @dev Handle wallet registration messages
    function _handleWalletRegistration(uint32 _origin, bytes calldata _messageBody, bytes32 messageId) internal {
        // Decode the registration payload
        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.decodeRegistration(_messageBody);

        // Defense in depth: verify payload sourceChainId matches Hyperlane origin
        if (payload.sourceChainId != _origin) {
            revert CrossChainInbox__SourceChainMismatch();
        }

        // Forward to RegistryHub with bridge context
        IRegistryHub(registryHub)
            .registerFromSpoke(payload.wallet, payload.sourceChainId, payload.isSponsored, BRIDGE_ID, messageId);

        emit RegistrationReceived(_origin, payload.wallet, messageId);
    }

    /// @dev Handle transaction batch messages
    function _handleTransactionBatch(uint32 _origin, bytes calldata _messageBody, bytes32 messageId) internal {
        // Decode the transaction batch payload
        CrossChainMessage.TransactionBatchPayload memory payload =
            CrossChainMessage.decodeTransactionBatch(_messageBody);

        // Forward to RegistryHub with full batch data
        IRegistryHub(registryHub)
            .registerTransactionBatchFromSpoke(
                payload.merkleRoot,
                payload.reporter,
                payload.reportedChainId,
                payload.sourceChainId,
                payload.transactionCount,
                payload.transactionHashes,
                payload.chainIds,
                payload.isSponsored,
                BRIDGE_ID,
                messageId
            );

        emit TransactionBatchReceived(_origin, payload.reporter, payload.merkleRoot, messageId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ICrossChainInbox
    function setTrustedSource(uint32 chainId, bytes32 spokeRegistry, bool trusted) external onlyOwner {
        _trustedSources[chainId][spokeRegistry] = trusted;
        emit TrustedSourceUpdated(chainId, spokeRegistry, trusted);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ICrossChainInbox
    function isTrustedSource(uint32 chainId, bytes32 sender) external view returns (bool) {
        return _trustedSources[chainId][sender];
    }

    /// @inheritdoc ICrossChainInbox
    function bridgeId() external pure returns (uint8) {
        return BRIDGE_ID;
    }
}

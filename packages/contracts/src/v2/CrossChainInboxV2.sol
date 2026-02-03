// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IFraudRegistryV2 } from "./interfaces/IFraudRegistryV2.sol";
import { IMessageRecipient } from "@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient.sol";
import { CrossChainMessageV2 } from "./libraries/CrossChainMessageV2.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title CrossChainInboxV2
/// @author Stolen Wallet Registry Team
/// @notice Hub chain message receiver for cross-chain registrations (V2)
/// @dev Receives messages from Hyperlane and forwards to FraudRegistryV2.registerFromSpoke.
///      Uses CrossChainMessageV2 format with full CAIP-10 support.
contract CrossChainInboxV2 is IMessageRecipient, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Bridge ID for Hyperlane
    uint8 public constant BRIDGE_ID = 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hyperlane mailbox contract address
    address public immutable mailbox;

    /// @notice FraudRegistryV2 contract address
    address public immutable fraudRegistry;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Mapping of chainId => spokeRegistry => trusted status
    mapping(uint32 => mapping(bytes32 => bool)) private _trustedSources;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet registration is received and processed
    event WalletRegistrationReceived(uint32 indexed origin, bytes32 indexed identifier, bytes32 messageId);

    /// @notice Emitted when a transaction batch is received and processed
    event TransactionBatchReceived(
        uint32 indexed origin, address indexed reporter, bytes32 merkleRoot, bytes32 messageId
    );

    /// @notice Emitted when trusted source configuration changes
    event TrustedSourceUpdated(uint32 indexed chainId, bytes32 indexed spokeRegistry, bool trusted);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error CrossChainInboxV2__ZeroAddress();
    error CrossChainInboxV2__OnlyMailbox();
    error CrossChainInboxV2__UntrustedSource();
    error CrossChainInboxV2__SourceChainMismatch();
    error CrossChainInboxV2__UnknownMessageType();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the CrossChainInboxV2
    /// @param _mailbox Hyperlane mailbox contract address
    /// @param _fraudRegistry FraudRegistryV2 contract address
    /// @param _owner Initial owner address
    constructor(address _mailbox, address _fraudRegistry, address _owner) Ownable(_owner) {
        if (_owner == address(0)) revert CrossChainInboxV2__ZeroAddress();
        if (_mailbox == address(0)) revert CrossChainInboxV2__ZeroAddress();
        if (_fraudRegistry == address(0)) revert CrossChainInboxV2__ZeroAddress();

        mailbox = _mailbox;
        fraudRegistry = _fraudRegistry;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyMailbox() {
        if (msg.sender != mailbox) revert CrossChainInboxV2__OnlyMailbox();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HYPERLANE MESSAGE RECIPIENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Handle incoming cross-chain message from Hyperlane
    /// @param _origin Origin chain domain ID
    /// @param _sender Sender address on origin chain (bytes32)
    /// @param _messageBody Encoded payload
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _messageBody) external onlyMailbox {
        // Validate source is trusted
        if (!_trustedSources[_origin][_sender]) {
            revert CrossChainInboxV2__UntrustedSource();
        }

        // Generate message ID from payload hash
        bytes32 messageId = keccak256(_messageBody);

        // Extract message type to determine routing
        bytes1 msgType = CrossChainMessageV2.getMessageType(_messageBody);

        if (msgType == CrossChainMessageV2.MSG_TYPE_WALLET) {
            _handleWalletRegistration(_origin, _messageBody, messageId);
        } else if (msgType == CrossChainMessageV2.MSG_TYPE_TRANSACTION_BATCH) {
            _handleTransactionBatch(_origin, _messageBody, messageId);
        } else {
            revert CrossChainInboxV2__UnknownMessageType();
        }
    }

    /// @dev Handle wallet registration messages (V2 format)
    function _handleWalletRegistration(uint32 _origin, bytes calldata _messageBody, bytes32 messageId) internal {
        // Decode the V2 registration payload
        CrossChainMessageV2.WalletRegistrationPayload memory payload =
            CrossChainMessageV2.decodeWalletRegistration(_messageBody);

        // Defense in depth: verify payload sourceChainId matches Hyperlane origin
        // Convert _origin (Hyperlane domain, typically EIP-155) to CAIP-2 hash
        bytes32 expectedSourceChainId = CAIP10.caip2Hash(uint64(_origin));
        if (payload.sourceChainId != expectedSourceChainId) {
            revert CrossChainInboxV2__SourceChainMismatch();
        }

        // Forward to FraudRegistryV2.registerFromSpoke with full CAIP-10 data
        IFraudRegistryV2(fraudRegistry)
            .registerFromSpoke(
                payload.namespaceHash,
                payload.chainRef,
                payload.identifier,
                payload.reportedChainId,
                payload.incidentTimestamp,
                payload.sourceChainId,
                payload.isSponsored,
                BRIDGE_ID,
                messageId
            );

        emit WalletRegistrationReceived(_origin, payload.identifier, messageId);
    }

    /// @dev Handle transaction batch messages (V2 format)
    /// @dev Note: Transaction batch support requires FraudRegistryV2 to have a corresponding method
    function _handleTransactionBatch(uint32 _origin, bytes calldata _messageBody, bytes32 messageId) internal {
        // Decode the V2 transaction batch payload
        CrossChainMessageV2.TransactionBatchPayload memory payload =
            CrossChainMessageV2.decodeTransactionBatch(_messageBody);

        // Defense in depth: verify sourceChainId matches origin
        bytes32 expectedSourceChainId = CAIP10.caip2Hash(uint64(_origin));
        if (payload.sourceChainId != expectedSourceChainId) {
            revert CrossChainInboxV2__SourceChainMismatch();
        }

        // TODO: Forward to FraudRegistryV2 transaction batch method when implemented
        // For now, emit event for tracking
        emit TransactionBatchReceived(_origin, payload.reporter, payload.merkleRoot, messageId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set trusted source for a chain
    /// @param chainId Hyperlane domain ID
    /// @param spokeRegistry Spoke registry address (as bytes32)
    /// @param trusted Whether the source is trusted
    function setTrustedSource(uint32 chainId, bytes32 spokeRegistry, bool trusted) external onlyOwner {
        _trustedSources[chainId][spokeRegistry] = trusted;
        emit TrustedSourceUpdated(chainId, spokeRegistry, trusted);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a source is trusted
    function isTrustedSource(uint32 chainId, bytes32 sender) external view returns (bool) {
        return _trustedSources[chainId][sender];
    }

    /// @notice Get bridge ID
    function bridgeId() external pure returns (uint8) {
        return BRIDGE_ID;
    }
}

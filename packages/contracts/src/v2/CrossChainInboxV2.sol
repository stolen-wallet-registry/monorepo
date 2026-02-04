// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IFraudRegistryV2 } from "./interfaces/IFraudRegistryV2.sol";
import { IMessageRecipient } from "@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient.sol";
import { CrossChainMessageV2 } from "./libraries/CrossChainMessageV2.sol";
import { CAIP10Evm } from "./libraries/CAIP10Evm.sol";
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
    /// @param origin The origin chain domain ID
    /// @param identifier The wallet identifier (bytes32)
    /// @param messageId The cross-chain message ID
    event WalletRegistrationReceived(uint32 indexed origin, bytes32 indexed identifier, bytes32 messageId);

    /// @notice Emitted when a transaction batch is received and processed
    /// @param origin The origin chain domain ID
    /// @param reporter The address that submitted the batch
    /// @param dataHash Hash of (txHashes, chainIds) - signature commitment
    /// @param messageId The cross-chain message ID
    event TransactionBatchReceived(
        uint32 indexed origin, address indexed reporter, bytes32 dataHash, bytes32 messageId
    );

    /// @notice Emitted when trusted source configuration changes
    /// @param chainId The Hyperlane domain ID
    /// @param spokeRegistry The spoke registry address (as bytes32)
    /// @param trusted Whether the source is now trusted
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
    /// @dev The messageId emitted is a payload-derived ID (keccak256 of message body), not Hyperlane's
    ///      native message ID. Hyperlane's native ID is computed from the full message envelope
    ///      (version, nonce, origin, sender, destination, recipient, body) which isn't passed to handle().
    ///      To correlate with Hyperlane's native ID, index Mailbox.Dispatch events on the source chain.
    /// @param _origin Origin chain domain ID
    /// @param _sender Sender address on origin chain (bytes32)
    /// @param _messageBody Encoded payload
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _messageBody) external onlyMailbox {
        // Validate source is trusted
        if (!_trustedSources[_origin][_sender]) {
            revert CrossChainInboxV2__UntrustedSource();
        }

        // Generate payload-derived ID for idempotency and event correlation
        // Note: This is NOT Hyperlane's native message ID (see function docs)
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
        bytes32 expectedSourceChainId = CAIP10Evm.caip2Hash(uint64(_origin));
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
    function _handleTransactionBatch(uint32 _origin, bytes calldata _messageBody, bytes32 messageId) internal {
        // Decode the V2 transaction batch payload
        CrossChainMessageV2.TransactionBatchPayload memory payload =
            CrossChainMessageV2.decodeTransactionBatch(_messageBody);

        // Defense in depth: verify sourceChainId matches origin
        bytes32 expectedSourceChainId = CAIP10Evm.caip2Hash(uint64(_origin));
        if (payload.sourceChainId != expectedSourceChainId) {
            revert CrossChainInboxV2__SourceChainMismatch();
        }

        // Forward to FraudRegistryV2
        IFraudRegistryV2(fraudRegistry)
            .registerTransactionsFromSpoke(
                payload.reporter,
                payload.dataHash,
                payload.reportedChainId,
                payload.sourceChainId,
                payload.isSponsored,
                payload.transactionHashes,
                payload.chainIds,
                BRIDGE_ID,
                messageId
            );

        emit TransactionBatchReceived(_origin, payload.reporter, payload.dataHash, messageId);
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
    /// @param chainId The Hyperlane domain ID
    /// @param sender The sender address (as bytes32)
    /// @return True if the source is trusted
    function isTrustedSource(uint32 chainId, bytes32 sender) external view returns (bool) {
        return _trustedSources[chainId][sender];
    }

    /// @notice Get bridge ID
    /// @return The bridge ID constant (1 for Hyperlane)
    function bridgeId() external pure returns (uint8) {
        return BRIDGE_ID;
    }
}

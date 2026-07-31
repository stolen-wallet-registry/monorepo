// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IFraudRegistryHub } from "./interfaces/IFraudRegistryHub.sol";
import { IMessageRecipient } from "@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient.sol";
import { CrossChainMessage } from "./libraries/CrossChainMessage.sol";
import { CAIP10Evm } from "./libraries/CAIP10Evm.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TimelockOwnable } from "./libraries/TimelockOwnable.sol";

/// @title CrossChainInbox
/// @author Stolen Wallet Registry Team
/// @notice Hub chain message receiver for cross-chain registrations
/// @dev Receives messages from Hyperlane and forwards to FraudRegistryHub.
///      Uses CrossChainMessage format with full CAIP-10 support.
contract CrossChainInbox is IMessageRecipient, TimelockOwnable {
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

    /// @notice FraudRegistryHub contract address
    address payable public immutable hub;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Mapping of chainId => spokeRegistry => trusted status
    mapping(uint32 => mapping(bytes32 => bool)) private _trustedSources;

    /// @dev Tracks processed message payloads to prevent duplicate processing
    mapping(bytes32 => bool) private _processedMessages;

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

    /// @notice Emitted when an already-processed message is delivered again and skipped
    /// @dev Not an error: a bridge retry or a second bridge delivering the same logical event is
    ///      expected, and the correct response is to no-op so the message stops being retried.
    /// @param origin The origin chain domain ID
    /// @param messageId The canonical message ID that was already processed
    event DuplicateMessageIgnored(uint32 indexed origin, bytes32 indexed messageId);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error CrossChainInbox__ZeroAddress();
    error CrossChainInbox__OnlyMailbox();
    error CrossChainInbox__UntrustedSource();
    error CrossChainInbox__SourceChainMismatch();
    error CrossChainInbox__UnknownMessageType();
    error CrossChainInbox__SweepFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the CrossChainInbox
    /// @param _mailbox Hyperlane mailbox contract address
    /// @param _hub FraudRegistryHub contract address
    /// @param _owner Initial owner address
    constructor(address _mailbox, address _hub, address _owner) Ownable(_owner) {
        // Note: _owner zero check is redundant with Ownable constructor but kept for
        // explicit/consistent validation pattern across all address parameters
        if (_owner == address(0)) revert CrossChainInbox__ZeroAddress();
        if (_mailbox == address(0)) revert CrossChainInbox__ZeroAddress();
        if (_hub == address(0)) revert CrossChainInbox__ZeroAddress();

        mailbox = _mailbox;
        hub = payable(_hub);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyMailbox() {
        if (msg.sender != mailbox) revert CrossChainInbox__OnlyMailbox();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HYPERLANE MESSAGE RECIPIENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Handle incoming cross-chain message from Hyperlane
    /// @dev The messageId is computed from a canonical re-encoding of the decoded fields (not the
    ///      raw bytes). This prevents trailing-bytes attacks where a bridge appends extra data to
    ///      bypass dedup. To correlate with Hyperlane's native ID, index Mailbox.Dispatch events
    ///      on the source chain.
    ///
    ///      `_origin` and `_sender` are part of the preimage. Without them the ID is a pure
    ///      function of publicly-predictable payload contents, so anyone able to get ANY trusted
    ///      source to deliver the same logical payload first could burn the ID and permanently
    ///      strand the genuine message. Including the route also keeps the same logical event
    ///      delivered by two different bridges from colliding.
    ///
    ///      A duplicate is a NO-OP, not a revert. Registration is idempotent by nature (the
    ///      registries skip already-registered entries), and Hyperlane retries a failed delivery
    ///      with the identical message body forever — so reverting turns an ordinary retry, or a
    ///      second bridge delivering the same event, into a permanently undeliverable message
    ///      with the user's bridge fee already spent.
    /// @param _origin Origin chain domain ID
    /// @param _sender Sender address on origin chain (bytes32)
    /// @param _messageBody Encoded payload
    /// @dev `payable` because IMessageRecipient.handle is payable from Hyperlane v3; the mailbox
    ///      forwards whatever msgValue the message's hook metadata requested. Our dispatches always
    ///      set msgValue to 0, so any value received here is unexpected and simply ignored.
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _messageBody) external payable onlyMailbox {
        // Validate source is trusted
        if (!_trustedSources[_origin][_sender]) {
            revert CrossChainInbox__UntrustedSource();
        }

        // Extract message type first, then decode + compute canonical messageId
        bytes1 msgType = CrossChainMessage.getMessageType(_messageBody);

        if (msgType == CrossChainMessage.MSG_TYPE_WALLET) {
            CrossChainMessage.WalletRegistrationPayload memory wp =
                CrossChainMessage.decodeWalletRegistration(_messageBody);
            bytes32 messageId = keccak256(abi.encode(_origin, _sender, wp));
            if (_processedMessages[messageId]) {
                emit DuplicateMessageIgnored(_origin, messageId);
                return;
            }
            _processedMessages[messageId] = true;
            _handleWalletRegistration(_origin, wp, messageId);
        } else if (msgType == CrossChainMessage.MSG_TYPE_TRANSACTION_BATCH) {
            CrossChainMessage.TransactionBatchPayload memory tp = CrossChainMessage.decodeTransactionBatch(_messageBody);
            bytes32 messageId = keccak256(abi.encode(_origin, _sender, tp));
            if (_processedMessages[messageId]) {
                emit DuplicateMessageIgnored(_origin, messageId);
                return;
            }
            _processedMessages[messageId] = true;
            _handleTransactionBatch(_origin, tp, messageId);
        } else {
            revert CrossChainInbox__UnknownMessageType();
        }
    }

    /// @dev Handle wallet registration from decoded payload
    function _handleWalletRegistration(
        uint32 _origin,
        CrossChainMessage.WalletRegistrationPayload memory payload,
        bytes32 messageId
    ) internal {
        // Defense in depth: verify payload sourceChainId matches Hyperlane origin
        bytes32 expectedSourceChainId = CAIP10Evm.caip2Hash(uint64(_origin));
        if (payload.sourceChainId != expectedSourceChainId) {
            revert CrossChainInbox__SourceChainMismatch();
        }

        // Forward to FraudRegistryHub.registerWalletFromSpoke with full CAIP-10 data
        IFraudRegistryHub(hub)
            .registerWalletFromSpoke(
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

    /// @dev Handle transaction batch from decoded payload
    function _handleTransactionBatch(
        uint32 _origin,
        CrossChainMessage.TransactionBatchPayload memory payload,
        bytes32 messageId
    ) internal {
        // Defense in depth: verify sourceChainId matches origin
        bytes32 expectedSourceChainId = CAIP10Evm.caip2Hash(uint64(_origin));
        if (payload.sourceChainId != expectedSourceChainId) {
            revert CrossChainInbox__SourceChainMismatch();
        }

        // Forward to FraudRegistryHub
        IFraudRegistryHub(hub)
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

    /// @notice Trust or un-trust a spoke registry as a source of cross-chain registrations
    /// @dev Granting trust is timelocked after setup (it widens who can write to the hub);
    ///      revoking stays immediate, mirroring HyperlaneAdapter.setAuthorizedSender. A trusted
    ///      source's messages reach WalletRegistry.registerFromHub, which performs no signature
    ///      check — so cutting off a compromised spoke must not require a 2-day wait, during
    ///      which the only alternative lever is the global pause that also kills every honest
    ///      spoke.
    /// @param chainId Hyperlane domain ID
    /// @param spokeRegistry Spoke registry address (as bytes32)
    /// @param trusted Whether the source is trusted
    function setTrustedSource(uint32 chainId, bytes32 spokeRegistry, bool trusted) external onlyOwner {
        if (trusted && setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        if (trusted && spokeRegistry == bytes32(0)) revert CrossChainInbox__ZeroAddress();
        _trustedSources[chainId][spokeRegistry] = trusted;
        emit TrustedSourceUpdated(chainId, spokeRegistry, trusted);
    }

    /// @notice Propose a trusted source change (2-day delay before activation)
    /// @param chainId Hyperlane domain ID of the source chain
    /// @param spokeRegistry Spoke registry address (as bytes32)
    /// @param trusted Whether the source should be trusted
    function proposeTrustedSource(uint32 chainId, bytes32 spokeRegistry, bool trusted) external onlyOwner {
        if (trusted && spokeRegistry == bytes32(0)) revert CrossChainInbox__ZeroAddress();
        bytes32 key = keccak256(abi.encode("setTrustedSource", chainId, spokeRegistry, trusted));
        _proposeAction(key);
    }

    /// @notice Activate a previously proposed trusted source change
    /// @param chainId Hyperlane domain ID of the source chain
    /// @param spokeRegistry Spoke registry address (as bytes32)
    /// @param trusted Whether the source should be trusted
    function activateTrustedSource(uint32 chainId, bytes32 spokeRegistry, bool trusted) external onlyOwner {
        bytes32 key = keccak256(abi.encode("setTrustedSource", chainId, spokeRegistry, trusted));
        _activateAction(key);
        _trustedSources[chainId][spokeRegistry] = trusted;
        emit TrustedSourceUpdated(chainId, spokeRegistry, trusted);
    }

    /// @notice Recover ETH held by this contract
    /// @dev `handle` is payable (Hyperlane v3), but our dispatches always set msgValue to 0 —
    ///      any balance here arrived unexpectedly (e.g. a misbehaving hook) and would otherwise
    ///      be locked forever.
    function sweep() external onlyOwner {
        (bool success,) = msg.sender.call{ value: address(this).balance }("");
        if (!success) revert CrossChainInbox__SweepFailed();
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

    /// @notice Check if a message has already been processed
    /// @param messageId The payload-derived message ID (keccak256 of message body)
    /// @return True if the message has been processed
    function isMessageProcessed(bytes32 messageId) external view returns (bool) {
        return _processedMessages[messageId];
    }

    /// @notice Get bridge ID
    /// @return The bridge ID constant (1 for Hyperlane)
    function bridgeId() external pure returns (uint8) {
        return BRIDGE_ID;
    }
}

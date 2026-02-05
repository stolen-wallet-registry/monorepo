// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISpokeRegistryV2
/// @author Stolen Wallet Registry Team
/// @notice Interface for spoke chain wallet registration (V2)
/// @dev V2 includes incidentTimestamp and reportedChainId in user signatures.
///      Works with FraudRegistryV2 on hub chain.
interface ISpokeRegistryV2 {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledgement data for pending wallet registrations
    /// @param trustedForwarder Address authorized to complete registration
    /// @param incidentTimestamp User-provided timestamp of when theft occurred
    /// @param reportedChainId CAIP-2 hash of chain where incident occurred (full bytes32 for cross-chain)
    /// @param startBlock Block number when grace period ends
    /// @param expiryBlock Block number when registration window expires
    /// @dev Storage layout (4 slots):
    ///      Slot 0: trustedForwarder (20) + incidentTimestamp (8) = 28 bytes
    ///      Slot 1: reportedChainId (32) - kept as bytes32 for cross-chain message compatibility
    ///      Slot 2: startBlock (32)
    ///      Slot 3: expiryBlock (32)
    ///      Note: Could optimize to 3 slots if startBlock/expiryBlock changed to uint64
    struct AcknowledgementData {
        address trustedForwarder;
        uint64 incidentTimestamp;
        bytes32 reportedChainId;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Acknowledgement data for pending transaction batch registrations
    /// @param trustedForwarder Address authorized to complete registration
    /// @param dataHash Hash of (txHashes, chainIds) - signature commitment
    /// @param reportedChainId CAIP-2 hash of chain where transactions occurred
    /// @param transactionCount Number of transactions in batch
    /// @param startBlock Block number when grace period ends
    /// @param expiryBlock Block number when registration window expires
    struct TransactionAcknowledgementData {
        address trustedForwarder;
        bytes32 dataHash;
        bytes32 reportedChainId;
        uint32 transactionCount;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Fee breakdown for registration
    struct FeeBreakdown {
        uint256 bridgeFee;
        uint256 registrationFee;
        uint256 total;
        string bridgeName;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when wallet acknowledgement is recorded
    /// @param wallet The wallet being registered as stolen
    /// @param forwarder The authorized forwarder address
    /// @param reportedChainId CAIP-2 hash of chain where incident occurred
    /// @param incidentTimestamp When theft occurred
    /// @param isSponsored True if registration is sponsored by third party
    event WalletAcknowledged(
        address indexed wallet,
        address indexed forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bool isSponsored
    );

    /// @notice Emitted when registration message is sent to hub
    /// @param wallet The wallet being registered
    /// @param messageId Bridge message ID for tracking
    /// @param hubChainId Hub chain domain ID
    event RegistrationSentToHub(address indexed wallet, bytes32 indexed messageId, uint32 hubChainId);

    /// @notice Emitted when hub configuration is updated
    /// @param hubChainId The hub chain domain ID
    /// @param hubInbox The hub inbox address (as bytes32)
    event HubConfigUpdated(uint32 indexed hubChainId, bytes32 hubInbox);

    /// @notice Emitted when transaction batch acknowledgement is recorded
    /// @param reporter The address reporting the transactions
    /// @param forwarder The authorized forwarder address
    /// @param dataHash Hash of (txHashes, chainIds) - signature commitment
    /// @param reportedChainId CAIP-2 hash of chain where transactions occurred
    /// @param transactionCount Number of transactions in batch
    /// @param isSponsored True if registration is sponsored by third party
    event TransactionBatchAcknowledged(
        address indexed reporter,
        address indexed forwarder,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bool isSponsored
    );

    /// @notice Emitted when transaction batch registration message is sent to hub
    /// @param reporter The address that reported the transactions
    /// @param messageId Bridge message ID for tracking
    /// @param dataHash Hash of (txHashes, chainIds) - signature commitment
    /// @param hubChainId Hub chain domain ID
    event TransactionBatchSentToHub(
        address indexed reporter, bytes32 indexed messageId, bytes32 dataHash, uint32 hubChainId
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error SpokeRegistryV2__ZeroAddress();
    error SpokeRegistryV2__InvalidTimingConfig();
    error SpokeRegistryV2__InvalidOwner();
    error SpokeRegistryV2__SignatureExpired();
    error SpokeRegistryV2__InvalidNonce();
    error SpokeRegistryV2__InvalidSigner();
    error SpokeRegistryV2__InvalidForwarder();
    error SpokeRegistryV2__GracePeriodNotStarted();
    error SpokeRegistryV2__ForwarderExpired();
    error SpokeRegistryV2__HubNotConfigured();
    error SpokeRegistryV2__InsufficientFee();
    error SpokeRegistryV2__RefundFailed();
    error SpokeRegistryV2__WithdrawalFailed();
    error SpokeRegistryV2__InvalidHubConfig();
    error SpokeRegistryV2__EmptyBatch();
    error SpokeRegistryV2__ArrayLengthMismatch();
    error SpokeRegistryV2__InvalidDataHash();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Record acknowledgement with EIP-712 signature
    /// @dev Caller becomes trusted forwarder. Signature includes incident details.
    ///      Function signature aligns with hub for frontend consistency.
    /// @param wallet Wallet address being registered as stolen
    /// @param reportedChainId Chain ID where theft occurred (converted to CAIP-2 hash internally)
    /// @param incidentTimestamp Unix timestamp when theft occurred (user-provided)
    /// @param deadline Signature expiry timestamp
    /// @param nonce Expected nonce for replay protection
    /// @param v Signature v component
    /// @param r Signature r component
    /// @param s Signature s component
    function acknowledgeLocal(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2: Complete registration and send to hub
    /// @dev Must be called by trusted forwarder within registration window.
    ///      Function signature aligns with hub for frontend consistency.
    /// @param wallet Wallet address being registered
    /// @param reportedChainId Chain ID (must match acknowledgement, converted to CAIP-2 hash)
    /// @param incidentTimestamp Incident timestamp (must match acknowledgement)
    /// @param deadline Signature expiry timestamp
    /// @param nonce Expected nonce for replay protection
    /// @param v Signature v component
    /// @param r Signature r component
    /// @param s Signature s component
    function registerLocal(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    /// @notice Phase 1 (Transaction Batch): Record acknowledgement for transaction batch
    /// @dev Caller becomes trusted forwarder. Reporter signs to prove they intend to report.
    ///      dataHash = keccak256(abi.encodePacked(txHashes, chainIds))
    /// @param dataHash Hash of (txHashes, chainIds) - signature commitment
    /// @param reportedChainId CAIP-2 hash of chain where transactions occurred
    /// @param transactionCount Number of transactions in batch
    /// @param deadline Signature expiry timestamp
    /// @param nonce Expected nonce for replay protection
    /// @param reporter Address reporting the transactions (signer)
    /// @param v Signature v component
    /// @param r Signature r component
    /// @param s Signature s component
    function acknowledgeTransactionBatch(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2 (Transaction Batch): Complete registration and send to hub
    /// @dev Must be called by trusted forwarder within registration window.
    ///      Contract recomputes dataHash from arrays and verifies it matches acknowledgement.
    /// @param reportedChainId CAIP-2 hash (must match acknowledgement)
    /// @param deadline Signature expiry timestamp
    /// @param nonce Expected nonce for replay protection
    /// @param reporter Address that reported (must be signer)
    /// @param transactionHashes Array of transaction hashes in batch
    /// @param chainIds Parallel array of CAIP-2 chain IDs per transaction
    /// @param v Signature v component
    /// @param r Signature r component
    /// @param s Signature s component
    function registerTransactionBatch(
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if wallet has pending acknowledgement
    /// @param wallet The wallet address to check
    /// @return True if the wallet has a pending acknowledgement
    function isPending(address wallet) external view returns (bool);

    /// @notice Get acknowledgement data for wallet
    /// @param wallet The wallet address
    /// @return The acknowledgement data struct
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory);

    /// @notice Check if reporter has pending transaction batch acknowledgement
    /// @param reporter The reporter address to check
    /// @return True if the reporter has a pending transaction batch acknowledgement
    function isPendingTransactionBatch(address reporter) external view returns (bool);

    /// @notice Get transaction batch acknowledgement data
    /// @param reporter The reporter address
    /// @return The transaction acknowledgement data struct
    function getTransactionAcknowledgement(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory);

    /// @notice Get nonce for wallet
    /// @param wallet The wallet address
    /// @return The current nonce value
    function nonces(address wallet) external view returns (uint256);

    /// @notice Quote total registration fee
    /// @param owner The wallet owner address
    /// @return The total fee in wei
    function quoteRegistration(address owner) external view returns (uint256);

    /// @notice Get detailed fee breakdown
    /// @param owner The wallet owner address
    /// @return The fee breakdown struct
    function quoteFeeBreakdown(address owner) external view returns (FeeBreakdown memory);

    /// @notice Generate hash struct for signing (frontend helper)
    /// @dev Function signature aligns with hub for frontend consistency.
    /// @param reportedChainId Chain ID where incident occurred
    /// @param incidentTimestamp When theft occurred
    /// @param forwarder Address that will submit the transaction
    /// @param step 1 for acknowledgement, 2 for registration
    /// @return deadline Signature expiry timestamp
    /// @return hashStruct Hash to sign
    function generateHashStruct(uint64 reportedChainId, uint64 incidentTimestamp, address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get deadline info for pending registration
    /// @param session The wallet address (session)
    /// @return currentBlock The current block number
    /// @return expiryBlock The block when registration window closes
    /// @return startBlock The block when grace period ends
    /// @return graceStartsAt Blocks until grace period ends
    /// @return timeLeft Blocks until expiry
    /// @return isExpired Whether the registration window has closed
    function getDeadlines(address session)
        external
        view
        returns (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        );
}

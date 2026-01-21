// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISpokeTransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for spoke chain transaction batch registration
/// @dev Handles two-phase registration locally and forwards full transaction data to hub via bridge.
///      All transaction hashes and chain IDs are sent to hub for event emission (single indexer model).
interface ISpokeTransactionRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data stored for a pending acknowledgement
    /// @dev Struct is packed for gas efficiency: address (20) + uint32 (4) fit in one slot
    /// @param trustedForwarder Address authorized to complete the registration
    /// @param pendingTxCount Number of transactions in the batch
    /// @param pendingMerkleRoot Merkle root of the batch being registered
    /// @param pendingReportedChainId CAIP-2 chain ID where transactions occurred
    /// @param startBlock Block number when grace period ends
    /// @param expiryBlock Block number when registration window closes
    struct AcknowledgementData {
        // Slot 1: address (20 bytes) + uint32 (4 bytes) = 24 bytes
        address trustedForwarder;
        uint32 pendingTxCount;
        // Slot 2-5: 32-byte values
        bytes32 pendingMerkleRoot;
        bytes32 pendingReportedChainId;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Breakdown of fees for cross-chain registration
    /// @param bridgeFee Cross-chain message fee from the configured bridge adapter
    /// @param registrationFee Protocol fee from FeeManager (0 if no fee manager)
    /// @param total Combined fee required (bridgeFee + registrationFee)
    /// @param bridgeName Human-readable name of the bridge
    struct FeeBreakdown {
        uint256 bridgeFee;
        uint256 registrationFee;
        uint256 total;
        string bridgeName;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when transaction batch acknowledgement is received on spoke
    /// @param merkleRoot Root of the Merkle tree for this batch
    /// @param reporter Address submitting the registration
    /// @param forwarder Address authorized to complete registration
    /// @param reportedChainId CAIP-2 chain ID where transactions occurred
    /// @param transactionCount Number of transactions in the batch
    /// @param isSponsored True if forwarder is different from reporter
    /// @param startBlock Block when grace period ends
    /// @param expiryBlock Block when registration window closes
    event TransactionBatchAcknowledged(
        bytes32 indexed merkleRoot,
        address indexed reporter,
        address indexed forwarder,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bool isSponsored,
        uint256 startBlock,
        uint256 expiryBlock
    );

    /// @notice Emitted when transaction batch is sent to hub via bridge
    /// @param merkleRoot Root of the Merkle tree for this batch
    /// @param reporter Address that submitted the registration
    /// @param messageId Bridge message identifier for tracking
    /// @param transactionCount Number of transactions in the batch
    /// @param crossChainFee Fee paid for cross-chain messaging
    event TransactionBatchForwarded(
        bytes32 indexed merkleRoot,
        address indexed reporter,
        bytes32 indexed messageId,
        uint32 transactionCount,
        uint256 crossChainFee
    );

    /// @notice Emitted when hub configuration is updated
    event HubConfigUpdated(uint32 indexed hubChainId, bytes32 hubInbox);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the provided nonce doesn't match expected
    error SpokeTransactionRegistry__InvalidNonce();

    /// @notice Thrown when signature deadline has passed
    error SpokeTransactionRegistry__SignatureExpired();

    /// @notice Thrown when signature is invalid
    error SpokeTransactionRegistry__InvalidSigner();

    /// @notice Thrown when caller is not the authorized forwarder
    error SpokeTransactionRegistry__InvalidForwarder();

    /// @notice Thrown when registration window has expired
    error SpokeTransactionRegistry__RegistrationExpired();

    /// @notice Thrown when grace period hasn't started yet
    error SpokeTransactionRegistry__GracePeriodNotStarted();

    /// @notice Thrown when no pending acknowledgement exists
    error SpokeTransactionRegistry__NoPendingAcknowledgement();

    /// @notice Thrown when merkle root doesn't match acknowledgement
    error SpokeTransactionRegistry__MerkleRootMismatch();

    /// @notice Thrown when reported chain ID doesn't match acknowledgement
    error SpokeTransactionRegistry__ReportedChainIdMismatch();

    /// @notice Thrown when array lengths don't match
    error SpokeTransactionRegistry__ArrayLengthMismatch();

    /// @notice Thrown when insufficient fee is provided
    error SpokeTransactionRegistry__InsufficientFee();

    /// @notice Thrown when refund fails
    error SpokeTransactionRegistry__RefundFailed();

    /// @notice Thrown when hub is not configured
    error SpokeTransactionRegistry__HubNotConfigured();

    /// @notice Thrown when a zero address is provided
    error SpokeTransactionRegistry__ZeroAddress();

    /// @notice Thrown when hub config has invalid parameter combination
    error SpokeTransactionRegistry__InvalidHubConfig();

    /// @notice Thrown when timing configuration is invalid
    error SpokeTransactionRegistry__InvalidTimingConfig();

    /// @notice Thrown when reporter address is zero
    error SpokeTransactionRegistry__InvalidReporter();

    /// @notice Thrown when withdrawal fails
    error SpokeTransactionRegistry__WithdrawalFailed();

    /// @notice Thrown when transaction count is zero (empty batch)
    error SpokeTransactionRegistry__EmptyBatch();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Acknowledge intent to register transaction batch (starts grace period)
    /// @dev Creates trusted forwarder relationship and validates batch data.
    ///
    ///      CAIP-2 Encoding Note:
    ///      - reportedChainId and chainIds are bytes32 keccak256 hashes of CAIP-2 strings
    ///      - Example: keccak256("eip155:1") for Ethereum mainnet
    ///      - This matches the EIP-712 typed data format used in signatures
    ///      - Off-chain signers/indexers should use: keccak256(abi.encodePacked(caip2String))
    ///
    /// @param merkleRoot Root of the Merkle tree (OZ StandardMerkleTree format)
    /// @param reportedChainId keccak256 hash of CAIP-2 chain ID where transactions occurred
    /// @param transactionCount Number of transactions in the batch
    /// @param transactionHashes Full list of transaction hashes
    /// @param chainIds Parallel array of keccak256 hashes of CAIP-2 chain IDs per transaction
    /// @param reporter Address of the reporter (must sign the acknowledgement)
    /// @param deadline EIP-712 signature deadline (timestamp)
    /// @param v Signature component
    /// @param r Signature component
    /// @param s Signature component
    function acknowledge(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        address reporter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2: Complete registration after grace period (sends to hub)
    /// @dev Validates grace period timing and sends cross-chain message with full batch data.
    /// @param merkleRoot Root of the Merkle tree (must match acknowledgement)
    /// @param reportedChainId keccak256 hash of the CAIP-2 chain ID where transactions occurred (must match acknowledgement)
    /// @param transactionHashes Full list of transaction hashes
    /// @param chainIds Parallel array of keccak256 hashes of CAIP-2 chain IDs per transaction
    /// @param reporter Address of the reporter (must sign the registration)
    /// @param deadline EIP-712 signature deadline (timestamp)
    /// @param v Signature component
    /// @param r Signature component
    /// @param s Signature component
    function register(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        address reporter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if reporter has pending acknowledgement
    /// @param reporter The address to query
    /// @return True if there is a pending acknowledgement
    function isPending(address reporter) external view returns (bool);

    /// @notice Get acknowledgement data for a reporter
    /// @param reporter The address to query
    /// @return data The acknowledgement data
    function getAcknowledgement(address reporter) external view returns (AcknowledgementData memory data);

    /// @notice Get current nonce for reporter
    /// @param reporter The address to query
    /// @return The current nonce value
    function nonces(address reporter) external view returns (uint256);

    /// @notice Quote total cost for registration (bridge fee + registration fee)
    /// @param transactionCount Number of transactions in the batch
    /// @return Total fee required in native token
    function quoteRegistration(uint32 transactionCount) external view returns (uint256);

    /// @notice Get detailed fee breakdown for registration
    /// @param transactionCount Number of transactions in the batch
    /// @return breakdown Structured fee data including bridge name
    function quoteFeeBreakdown(uint32 transactionCount) external view returns (FeeBreakdown memory breakdown);

    /// @notice Get the hub chain domain ID
    /// @return The Hyperlane domain ID of the hub chain
    function hubChainId() external view returns (uint32);

    /// @notice Get the hub inbox address (bytes32 for cross-chain)
    /// @return The CrossChainInbox address on the hub
    function hubInbox() external view returns (bytes32);

    /// @notice Get grace period timing information for a pending acknowledgement
    /// @param reporter The reporter address to query
    /// @return currentBlock Current block number
    /// @return expiryBlock Block when registration window closes
    /// @return startBlock Block when grace period ends (registration can begin)
    /// @return graceStartsAt Blocks remaining until grace period ends (0 if already passed)
    /// @return timeLeft Blocks remaining until registration expires (0 if expired)
    /// @return isExpired True if the registration window has closed
    function getDeadlines(address reporter)
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

    /// @notice Generate hash struct for EIP-712 signing (frontend compatibility)
    /// @dev Used by frontend to get deadline and hash for offline signing.
    ///      Step 1 = acknowledgement, Step 2 = registration.
    ///      IMPORTANT: Must be called by the reporter address since it uses msg.sender for nonce lookup.
    /// @param merkleRoot Root of the Merkle tree for this batch
    /// @param reportedChainId keccak256 hash of the CAIP-2 chain ID where transactions occurred
    /// @param transactionCount Number of transactions in the batch
    /// @param forwarder Address authorized to submit the transaction
    /// @param step 1 for acknowledgement, 2 for registration
    /// @return deadline Signature deadline (timestamp)
    /// @return hashStruct The EIP-712 struct hash for signing
    function generateHashStruct(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address forwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct);
}

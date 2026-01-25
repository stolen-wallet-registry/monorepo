// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStolenTransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Stolen Transaction Registry subregistry
/// @dev Implements two-phase registration for transaction batches using Merkle trees.
///      Uses Merkle trees for efficient batch storage - only the root is stored on-chain,
///      while individual transaction hashes are emitted in events for indexer reconstruction.
///
/// KEY DESIGN (OpenZeppelin StandardMerkleTree v1.0.8+ Compatible):
/// - Merkle leaf = keccak256(keccak256(abi.encode(txHash, chainId)))
/// - Single batch can contain transactions from multiple chains
/// - Events emit parallel arrays: txHashes[] + chainIds[] for data availability
/// - CAIP-2 chain identifiers (bytes32) support EVM and non-EVM blockchains
interface IStolenTransactionRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Bridge identifier enum
    /// @dev Indicates which bridge delivered a cross-chain registration (NONE for native)
    enum BridgeId {
        NONE, // 0 - Native registration (no bridge)
        HYPERLANE, // 1 - Hyperlane bridge
        CCIP, // 2 - Chainlink CCIP
        WORMHOLE // 3 - Wormhole bridge
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data stored for a registered transaction batch
    /// @dev Optimized for storage efficiency - individual txHashes NOT stored, only in events
    /// @param merkleRoot Root of transaction hash tree (leaf = keccak256(txHash || chainId))
    /// @param reporter Address that reported this batch
    /// @param reportedChainId CAIP-2 chain identifier: keccak256("eip155:8453") for Base
    /// @param sourceChainId Source chain CAIP-2 identifier (0x0 if native registration)
    /// @param registeredAt Block number when registration was finalized (uint64)
    /// @param transactionCount Number of transactions in the batch (uint32)
    /// @param bridgeId Which bridge delivered the message (BridgeId enum)
    /// @param isSponsored True if a third party paid gas on behalf of reporter
    /// @param operatorVerified Future: True if an operator has verified this batch
    /// @param crossChainMessageId Bridge message ID for explorer linking (0x0 for native)
    struct TransactionBatch {
        // === Slot 1 ===
        bytes32 merkleRoot;
        // === Slot 2 ===
        address reporter; // 20 bytes
        uint64 registeredAt; // 8 bytes
        uint32 transactionCount; // 4 bytes
        // === Slot 3 ===
        bytes32 reportedChainId;
        // === Slot 4 ===
        bytes32 sourceChainId;
        // === Slot 5 (packed - 3 bytes used) ===
        uint8 bridgeId; // 1 byte
        bool isSponsored; // 1 byte
        bool operatorVerified; // 1 byte
        // === Slot 6 ===
        bytes32 crossChainMessageId;
    }

    /// @notice Data stored for a pending acknowledgement (before registration completes)
    /// @dev Optimized for storage: 3 slots instead of 6 by using uint32 for block numbers.
    ///      uint32 supports ~4.3B blocks = ~1,600 years at 12s/block - sufficient for all chains.
    /// @param pendingMerkleRoot Root of the Merkle tree being registered
    /// @param pendingChainId CAIP-2 chain identifier for the batch
    /// @param trustedForwarder Address authorized to submit the registration transaction
    /// @param pendingTxCount Number of transactions in the batch
    /// @param startBlock Block number when grace period ends and registration can begin
    /// @param expiryBlock Block number after which the registration window closes
    struct AcknowledgementData {
        // === Slot 1 (32 bytes) ===
        bytes32 pendingMerkleRoot;
        // === Slot 2 (32 bytes) ===
        bytes32 pendingChainId;
        // === Slot 3 (32 bytes packed) ===
        address trustedForwarder; // 20 bytes
        uint32 pendingTxCount; // 4 bytes
        uint32 startBlock; // 4 bytes
        uint32 expiryBlock; // 4 bytes
    }

    /// @notice Data stored for an operator-submitted transaction batch
    /// @dev Operator batches bypass two-phase registration (operators are DAO-vetted)
    /// @param merkleRoot Root of the Merkle tree (leaf = keccak256(txHash || chainId))
    /// @param operator Address of the operator who submitted the batch
    /// @param reportedChainId CAIP-2 chain identifier where transactions occurred
    /// @param registeredAt Block number when the batch was registered
    /// @param transactionCount Number of transactions in the batch
    /// @param invalidated True if batch was soft-deleted by owner
    struct OperatorTransactionBatch {
        // === Slot 1 ===
        bytes32 merkleRoot;
        // === Slot 2 ===
        address operator; // 20 bytes
        uint64 registeredAt; // 8 bytes
        uint32 transactionCount; // 4 bytes
        // === Slot 3 ===
        bytes32 reportedChainId;
        // === Slot 4 (1 byte used) ===
        bool invalidated; // 1 byte
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the provided nonce doesn't match the expected nonce
    error InvalidNonce();

    /// @notice Thrown when the acknowledgement signature deadline has passed
    error Acknowledgement__Expired();

    /// @notice Thrown when the acknowledgement signature is invalid or signer doesn't match
    error Acknowledgement__InvalidSigner();

    /// @notice Thrown when the registration signature deadline has passed
    error Registration__SignatureExpired();

    /// @notice Thrown when the registration signature is invalid or signer doesn't match
    error Registration__InvalidSigner();

    /// @notice Thrown when msg.sender is not the authorized forwarder for this registration
    error Registration__InvalidForwarder();

    /// @notice Thrown when attempting to register after the grace period has expired
    error Registration__ForwarderExpired();

    /// @notice Thrown when attempting to register before the grace period has started
    error Registration__GracePeriodNotStarted();

    /// @notice Thrown when the batch is already registered
    error AlreadyRegistered();

    /// @notice Thrown when the reporter address is the zero address
    error InvalidReporter();

    /// @notice Thrown when the provided fee is less than required
    error StolenTransactionRegistry__InsufficientFee();

    /// @notice Thrown when fee forwarding to RegistryHub fails
    error FeeForwardFailed();

    /// @notice Thrown when caller is not authorized (not RegistryHub for cross-chain registration)
    error UnauthorizedCaller();

    /// @notice Thrown when an invalid bridge ID is provided
    error InvalidBridgeId();

    /// @notice Thrown when chain ID is invalid
    error InvalidChainId();

    /// @notice Thrown when timing configuration is invalid
    error InvalidTimingConfig();

    /// @notice Thrown when fee configuration is invalid
    error InvalidFeeConfig();

    /// @notice Thrown when the Merkle root is zero
    error InvalidMerkleRoot();

    /// @notice Thrown when transaction count is zero
    error InvalidTransactionCount();

    /// @notice Thrown when the Merkle root doesn't match the computed root from tx hashes
    error MerkleRootMismatch();

    /// @notice Thrown when txHashes and chainIds arrays have different lengths
    error ArrayLengthMismatch();

    /// @notice Thrown when Merkle proof verification fails
    error InvalidMerkleProof();

    // ─────────────────────────────────────────────────────────────────────────────
    // OPERATOR BATCH ERRORS
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when caller is not an approved operator for transaction registry
    error StolenTransactionRegistry__NotApprovedOperator();

    /// @notice Thrown when operator batch is not found
    error StolenTransactionRegistry__BatchNotFound();

    /// @notice Thrown when operator batch is already registered
    error StolenTransactionRegistry__BatchAlreadyRegistered();

    /// @notice Thrown when batch or entry is already invalidated
    error StolenTransactionRegistry__AlreadyInvalidated();

    /// @notice Thrown when trying to reinstate an entry that isn't invalidated
    error StolenTransactionRegistry__EntryNotInvalidated();

    /// @notice Thrown when computed Merkle root doesn't match provided root
    error StolenTransactionRegistry__MerkleRootMismatch();

    /// @notice Thrown when array lengths don't match
    error StolenTransactionRegistry__ArrayLengthMismatch();

    /// @notice Thrown when transaction count is invalid
    error StolenTransactionRegistry__InvalidTransactionCount();

    /// @notice Thrown when Merkle root is zero
    error StolenTransactionRegistry__InvalidMerkleRoot();

    /// @notice Thrown when a transaction hash in the batch is zero
    error StolenTransactionRegistry__InvalidTransactionHash();

    /// @notice Thrown when a chain ID entry in the batch is zero
    error StolenTransactionRegistry__InvalidChainIdEntry();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a reporter acknowledges intent to register a transaction batch
    /// @param merkleRoot The Merkle root of the batch being acknowledged
    /// @param reporter The address reporting the fraudulent transactions
    /// @param forwarder The address authorized to complete the registration
    /// @param reportedChainId CAIP-2 chain identifier where transactions occurred
    /// @param transactionCount Number of transactions in the batch
    /// @param isSponsored True if forwarder is different from reporter
    event TransactionBatchAcknowledged(
        bytes32 indexed merkleRoot,
        address indexed reporter,
        address indexed forwarder,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bool isSponsored
    );

    /// @notice Emitted when a transaction batch registration is finalized
    /// @dev Transaction hashes emitted here for data availability (not stored on-chain)
    /// @param batchId Unique identifier for this batch
    /// @param merkleRoot The Merkle root of the registered batch
    /// @param reporter The address that reported the batch
    /// @param reportedChainId Primary chain CAIP-2 identifier
    /// @param transactionCount Number of transactions in the batch
    /// @param isSponsored True if registration was submitted by a third party
    /// @param transactionHashes Raw tx hashes (parallel with chainIds)
    /// @param chainIds CAIP-2 chainId for each txHash (parallel with transactionHashes)
    event TransactionBatchRegistered(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        address indexed reporter,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bool isSponsored,
        bytes32[] transactionHashes,
        bytes32[] chainIds
    );

    /// @notice Emitted when an operator verifies a batch (future feature)
    /// @param batchId The batch that was verified
    /// @param operator The operator that verified the batch
    event OperatorVerified(bytes32 indexed batchId, address indexed operator);

    // ─────────────────────────────────────────────────────────────────────────────
    // OPERATOR BATCH EVENTS
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when an operator registers a transaction batch (single-phase)
    /// @param batchId Unique identifier for this batch
    /// @param merkleRoot Root of the Merkle tree
    /// @param operator Address of the operator who submitted the batch
    /// @param reportedChainId CAIP-2 chain identifier where transactions occurred
    /// @param transactionCount Number of transactions in the batch
    /// @param transactionHashes Array of transaction hashes in the batch
    /// @param chainIds Array of chain IDs for each transaction
    event TransactionBatchRegisteredByOperator(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        address indexed operator,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bytes32[] transactionHashes,
        bytes32[] chainIds
    );

    /// @notice Emitted when an operator batch is invalidated
    /// @param batchId The batch that was invalidated
    event TransactionBatchInvalidated(bytes32 indexed batchId);

    /// @notice Emitted when an individual transaction entry is invalidated
    /// @param entryHash The keccak256(txHash, chainId) that was invalidated
    event TransactionEntryInvalidated(bytes32 indexed entryHash);

    /// @notice Emitted when an individual transaction entry is reinstated
    /// @param entryHash The keccak256(txHash, chainId) that was reinstated
    event TransactionEntryReinstated(bytes32 indexed entryHash);

    /// @notice Emitted when the operator registry address is updated
    /// @param oldRegistry Previous operator registry address
    /// @param newRegistry New operator registry address
    event OperatorRegistrySet(address indexed oldRegistry, address indexed newRegistry);

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Submit acknowledgement of intent to register a transaction batch
    /// @dev Creates a trusted forwarder relationship and starts the grace period.
    ///      The reporter must sign an EIP-712 message authorizing this submission.
    ///      Verifies Merkle root matches computed root from txHashes and chainIds.
    /// @param merkleRoot Root of the Merkle tree (leaf = keccak256(txHash || chainId))
    /// @param reportedChainId CAIP-2 chain identifier where transactions occurred
    /// @param transactionCount Number of transactions in batch
    /// @param transactionHashes Full list of tx hashes
    /// @param chainIds CAIP-2 chainId for each txHash (parallel array)
    /// @param reporter Address of the reporter (for signature verification)
    /// @param deadline Timestamp after which the signature is no longer valid
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
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

    /// @notice Phase 2: Complete the registration after grace period
    /// @dev Must be called by the same forwarder that was authorized in acknowledge().
    ///      Must be called after grace period starts but before it expires.
    ///      Transaction hashes are emitted in event for data availability.
    /// @param merkleRoot Root of the Merkle tree being registered
    /// @param reportedChainId CAIP-2 chain identifier
    /// @param transactionHashes Full list of tx hashes
    /// @param chainIds CAIP-2 chainId for each txHash (parallel array)
    /// @param reporter Address of the reporter (for signature verification)
    /// @param deadline Timestamp after which the signature is no longer valid
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
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

    /// @notice Register a transaction batch from a cross-chain spoke registration
    /// @dev Only callable by the RegistryHub contract. Used for cross-chain registrations
    ///      where the two-phase flow already completed on the spoke chain.
    /// @param merkleRoot Root of the Merkle tree
    /// @param reporter The address that reported the batch
    /// @param reportedChainId CAIP-2 chain identifier where transactions occurred
    /// @param sourceChainId Source chain CAIP-2 identifier
    /// @param transactionCount Number of transactions in batch
    /// @param transactionHashes Full list of tx hashes
    /// @param chainIds CAIP-2 chainId for each txHash (parallel array)
    /// @param isSponsored True if a third party paid gas
    /// @param bridgeId Which bridge delivered the message
    /// @param crossChainMessageId Bridge message ID for explorer linking
    function registerFromHub(
        bytes32 merkleRoot,
        address reporter,
        bytes32 reportedChainId,
        bytes32 sourceChainId,
        uint32 transactionCount,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external;

    // ─────────────────────────────────────────────────────────────────────────────
    // OPERATOR BATCH FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Register a batch of stolen transactions as an approved operator (single-phase)
    /// @dev Operators bypass two-phase registration since they are DAO-vetted.
    ///      The Merkle root is computed on-chain and verified against the provided root.
    /// @param merkleRoot Pre-computed Merkle root for verification
    /// @param reportedChainId CAIP-2 chain identifier where transactions occurred
    /// @param transactionHashes Array of transaction hashes in the batch
    /// @param chainIds Array of CAIP-2 chain IDs for each transaction
    function registerBatchAsOperator(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) external payable;

    /// @notice Invalidate an entire operator batch (soft delete)
    /// @dev Only callable by contract owner. Marks batch as invalidated.
    /// @param batchId The batch ID to invalidate
    function invalidateTransactionBatch(bytes32 batchId) external;

    /// @notice Invalidate a single transaction entry
    /// @dev Only callable by contract owner. For surgical removal of false positives.
    /// @param entryHash The keccak256(txHash, chainId) to invalidate
    function invalidateTransactionEntry(bytes32 entryHash) external;

    /// @notice Reinstate a previously invalidated transaction entry
    /// @dev Only callable by contract owner. Allows reversal of incorrect invalidations.
    /// @param entryHash The keccak256(txHash, chainId) to reinstate
    function reinstateTransactionEntry(bytes32 entryHash) external;

    /// @notice Set the operator registry address
    /// @dev Only callable by contract owner
    /// @param _operatorRegistry The new operator registry address
    function setOperatorRegistry(address _operatorRegistry) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary Query Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a batch has been registered
    /// @param batchId The batch ID to query (keccak256(merkleRoot, reporter, reportedChainId))
    /// @return True if the batch is registered
    function isBatchRegistered(bytes32 batchId) external view returns (bool);

    /// @notice Check if a reporter has a pending acknowledgement
    /// @param reporter The address to query
    /// @return True if there is a pending acknowledgement
    function isPending(address reporter) external view returns (bool);

    /// @notice Get full batch data for a registered batch
    /// @param batchId The batch ID to query
    /// @return data The batch data (zeroed struct if not registered)
    function getBatch(bytes32 batchId) external view returns (TransactionBatch memory data);

    /// @notice Get pending acknowledgement data for a reporter
    /// @param reporter The address to query
    /// @return data The acknowledgement data (zeroed struct if no pending acknowledgement)
    function getAcknowledgement(address reporter) external view returns (AcknowledgementData memory data);

    /// @notice Verify a transaction is in a registered batch
    /// @dev Uses OZ StandardMerkleTree leaf format for proof verification
    /// @param txHash Transaction hash to verify
    /// @param chainId CAIP-2 chain identifier for this transaction
    /// @param batchId Batch ID to check against
    /// @param merkleProof Proof of inclusion
    /// @return True if the transaction is in the registered batch
    function verifyTransaction(bytes32 txHash, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Fee Configuration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fee manager address (address(0) = free registrations)
    /// @return The fee manager contract address
    function feeManager() external view returns (address);

    /// @notice Registry hub address for fee forwarding
    /// @return The registry hub contract address
    function registryHub() external view returns (address);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the current nonce for a reporter
    /// @param reporter The address to query
    /// @return The current nonce value
    function nonces(address reporter) external view returns (uint256);

    /// @notice Generate hash struct for EIP-712 signature
    /// @dev Used by frontend to prepare typed data for signing.
    ///      SECURITY: Uses msg.sender as the reporter in the hash struct.
    /// @param merkleRoot Root of the Merkle tree
    /// @param reportedChainId CAIP-2 chain identifier
    /// @param transactionCount Number of transactions in batch
    /// @param forwarder The address that will submit the transaction
    /// @param step 1 for acknowledgement, any other value for registration
    /// @return deadline The signature expiry timestamp
    /// @return hashStruct The EIP-712 hash struct to sign
    function generateHashStruct(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address forwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct);

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
            uint32 currentBlock,
            uint32 expiryBlock,
            uint32 startBlock,
            uint32 graceStartsAt,
            uint32 timeLeft,
            bool isExpired
        );

    /// @notice Quote total cost for registration
    /// @dev Returns only the registration fee (no bridge fee on hub chain)
    /// @param reporter The address that will register (unused, for interface compatibility)
    /// @return Total fee required in native token
    function quoteRegistration(address reporter) external view returns (uint256);

    /// @notice Compute batch ID from batch parameters
    /// @param merkleRoot Root of the Merkle tree
    /// @param reporter Address that reported the batch
    /// @param reportedChainId CAIP-2 chain identifier
    /// @return batchId The computed batch ID
    function computeBatchId(bytes32 merkleRoot, address reporter, bytes32 reportedChainId)
        external
        pure
        returns (bytes32 batchId);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Operator Batch Queries
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the operator registry address
    /// @return The current operator registry contract address
    function operatorRegistry() external view returns (address);

    /// @notice Get operator batch data
    /// @param batchId The batch ID to query
    /// @return The operator batch data (zeroed if not found)
    function getOperatorBatch(bytes32 batchId) external view returns (OperatorTransactionBatch memory);

    /// @notice Check if an operator batch is registered
    /// @param batchId The batch ID to check
    /// @return True if the batch is registered
    function isOperatorBatchRegistered(bytes32 batchId) external view returns (bool);

    /// @notice Check if a transaction entry has been individually invalidated
    /// @param entryHash The keccak256(txHash, chainId) to check
    /// @return True if the entry is invalidated
    function isTransactionEntryInvalidated(bytes32 entryHash) external view returns (bool);

    /// @notice Verify a transaction in an operator batch with invalidation checks
    /// @dev Returns false if batch or entry is invalidated
    /// @param txHash Transaction hash to verify
    /// @param chainId CAIP-2 chain identifier for this transaction
    /// @param batchId Batch ID to check against
    /// @param merkleProof Proof of inclusion
    /// @return True if transaction is in a valid (non-invalidated) operator batch
    function verifyOperatorTransaction(bytes32 txHash, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool);
}

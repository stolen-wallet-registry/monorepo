// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Transaction Registry - handles two-phase transaction batch registration
/// @dev Extracted from FraudRegistryHub for contract size optimization
interface ITransactionRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data for a registered transaction
    /// @notice STORAGE INVARIANT: This struct MUST fit in 1 storage slot (32 bytes max).
    /// Current: 14 bytes (18 spare). Any new field requires a byte-count proof.
    /// Chain IDs, reporter, message IDs are EVENTS-ONLY — see events below.
    /// @param registeredAt Block timestamp when transaction was registered
    /// @param batchId Batch link (0 = individual registration)
    /// @param bridgeId Bridge protocol used (0 = local, 1 = Hyperlane, 2+ = future)
    /// @param isSponsored Whether registration was gas-sponsored
    struct TransactionEntry {
        uint64 registeredAt;
        uint64 batchId;
        uint8 bridgeId;
        bool isSponsored;
    }

    // Total: 8 + 8 + 1 + 1 = 18 bytes → 1 SLOT (14 bytes spare)

    /// @notice Acknowledgement data for pending transaction batch registration
    /// @dev Struct packed for gas efficiency: uint256/bytes32 fields first, then address+bool together
    /// @param deadline Block number deadline for completing registration
    /// @param nonce Nonce used for this acknowledgement
    /// @param gracePeriodStart Block number when grace period begins
    /// @param dataHash Hash of (txHashes, chainIds) committed in acknowledgement
    /// @param reportedChainId CAIP-2 chain ID hash where transactions were reported (stored for register-phase validation)
    /// @param trustedForwarder Address authorized to submit registration
    /// @param transactionCount Number of transactions in the batch (stored for register-phase validation)
    /// @param isSponsored Whether this is a sponsored registration
    struct TransactionAcknowledgementData {
        uint256 deadline;
        uint256 nonce;
        uint256 gracePeriodStart;
        bytes32 dataHash;
        bytes32 reportedChainId;
        address trustedForwarder;
        uint32 transactionCount;
        bool isSponsored;
    }

    /// @notice Batch registration data (unified across individual, operator, and cross-chain)
    /// @param operatorId The operator who submitted (bytes32(0) for individual/cross-chain)
    /// @param dataHash Hash of (txHashes, chainIds) committed (bytes32(0) for operator)
    /// @param reporter Address that reported (address(0) for operator)
    /// @param timestamp When the batch was submitted
    /// @param transactionCount Number of transactions in the batch
    struct TransactionBatch {
        bytes32 operatorId;
        bytes32 dataHash;
        address reporter;
        uint64 timestamp;
        uint32 transactionCount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error TransactionRegistry__AlreadyRegistered();
    error TransactionRegistry__AlreadyAcknowledged();
    error TransactionRegistry__NotAcknowledged();
    error TransactionRegistry__DeadlineExpired();
    error TransactionRegistry__DeadlineInPast();
    error TransactionRegistry__GracePeriodNotStarted();
    error TransactionRegistry__InvalidSignature();
    error TransactionRegistry__InvalidSigner();
    error TransactionRegistry__InvalidForwarder();
    error TransactionRegistry__InsufficientFee();
    error TransactionRegistry__ZeroAddress();
    error TransactionRegistry__OnlyHub();
    error TransactionRegistry__OnlyOperatorSubmitter();
    error TransactionRegistry__EmptyBatch();
    error TransactionRegistry__BatchTooLarge();
    error TransactionRegistry__ArrayLengthMismatch();
    error TransactionRegistry__DataHashMismatch();
    error TransactionRegistry__InvalidStep();
    error TransactionRegistry__InvalidTxHashLength();
    error TransactionRegistry__HubTransferFailed();
    error TransactionRegistry__RefundFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a transaction batch acknowledgement is submitted
    /// @param reporter The address registering the transactions
    /// @param trustedForwarder The address authorized to complete registration
    /// @param dataHash Hash of (txHashes, chainIds) committed
    /// @param isSponsored Whether this is a sponsored registration
    event TransactionBatchAcknowledged(
        address indexed reporter, address indexed trustedForwarder, bytes32 dataHash, bool isSponsored
    );

    /// @notice Emitted when a transaction is registered
    /// @param identifier The transaction hash identifier
    /// @param reportedChainId CAIP-2 chain ID hash where transaction occurred
    /// @param reporter Address that reported this transaction
    /// @param isSponsored Whether registration was gas-sponsored
    event TransactionRegistered(
        bytes32 indexed identifier, bytes32 indexed reportedChainId, address indexed reporter, bool isSponsored
    );

    /// @notice Emitted when a transaction batch registration is completed
    /// @param batchId The batch ID (auto-incrementing counter)
    /// @param reporter The address that registered the transactions
    /// @param dataHash Hash of (txHashes, chainIds)
    /// @param transactionCount Number of transactions registered
    /// @param isSponsored Whether registration was gas-sponsored
    event TransactionBatchRegistered(
        uint256 indexed batchId,
        address indexed reporter,
        bytes32 indexed dataHash,
        uint32 transactionCount,
        bool isSponsored
    );

    /// @notice Emitted when a transaction is registered via cross-chain message
    /// @param identifier The transaction hash identifier
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param bridgeId Bridge protocol ID
    /// @param messageId Cross-chain message ID
    event CrossChainTransactionRegistered(
        bytes32 indexed identifier, bytes32 indexed sourceChainId, uint8 bridgeId, bytes32 messageId
    );

    /// @notice Emitted when an operator batch is created
    /// @param batchId The batch ID
    /// @param operatorId The operator ID
    /// @param transactionCount Number of transactions in the batch
    event TransactionBatchCreated(uint256 indexed batchId, bytes32 indexed operatorId, uint32 transactionCount);

    /// @notice Emitted when collected fees are withdrawn by the owner
    /// @param recipient The address that received the fees
    /// @param amount The amount of ETH withdrawn
    event FeesWithdrawn(address indexed recipient, uint256 amount);

    /// @notice Emitted when hub address is updated
    /// @param oldHub The previous hub address
    /// @param newHub The new hub address
    event HubUpdated(address oldHub, address newHub);

    /// @notice Emitted when operator submitter address is updated
    /// @param oldOperatorSubmitter The previous operator submitter address
    /// @param newOperatorSubmitter The new operator submitter address
    event OperatorSubmitterUpdated(address oldOperatorSubmitter, address newOperatorSubmitter);

    /// @notice Fee breakdown for quoting registration costs
    /// @dev Matches SpokeRegistry.FeeBreakdown for unified frontend interface
    /// @param bridgeFee Cross-chain bridge fee (always 0 on hub)
    /// @param registrationFee Protocol registration fee
    /// @param total Total fee (bridgeFee + registrationFee)
    /// @param bridgeName Bridge protocol name (empty on hub)
    struct FeeBreakdown {
        uint256 bridgeFee;
        uint256 registrationFee;
        uint256 total;
        string bridgeName;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TWO-PHASE REGISTRATION (Individual Users)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Acknowledge intent to register transactions
    /// @dev Creates a pending acknowledgement with grace period.
    ///      reportedChainId and transactionCount are included in the EIP-712 signature
    ///      and stored in acknowledgement data for validation during registerTransactions().
    ///      isSponsored is derived as (reporter != trustedForwarder).
    /// @param reporter The address registering the transactions
    /// @param trustedForwarder The address authorized to complete registration
    /// @param deadline Timestamp deadline for the signature
    /// @param dataHash Hash of (txHashes, chainIds) being committed
    /// @param reportedChainId CAIP-2 chain ID hash where transactions were reported
    /// @param transactionCount Number of transactions in the batch
    /// @param v EIP-712 signature v component
    /// @param r EIP-712 signature r component
    /// @param s EIP-712 signature s component
    function acknowledgeTransactions(
        address reporter,
        address trustedForwarder,
        uint256 deadline,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2: Complete transaction batch registration after grace period
    /// @dev Must be called by trusted forwarder within deadline
    /// @param reporter The address that acknowledged the transactions
    /// @param deadline Block number deadline for the signature
    /// @param transactionHashes Array of transaction hashes to register
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    /// @param v EIP-712 signature v component
    /// @param r EIP-712 signature r component
    /// @param s EIP-712 signature s component
    function registerTransactions(
        address reporter,
        uint256 deadline,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION (Hub Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register transactions from cross-chain message (Hub only)
    /// @dev Called by FraudRegistryHub when processing cross-chain messages
    /// @param reporter The address that submitted the registration
    /// @param dataHash Hash of (txHashes, chainIds) - for verification
    /// @param reportedChainId CAIP-2 chain ID hash where transactions were reported
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param isSponsored Whether registration was gas-sponsored
    /// @param transactionHashes Array of transaction hashes
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    /// @param bridgeId Bridge protocol ID
    /// @param messageId Cross-chain message ID
    function registerTransactionsFromHub(
        address reporter,
        bytes32 dataHash,
        bytes32 reportedChainId,
        bytes32 sourceChainId,
        bool isSponsored,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 bridgeId,
        bytes32 messageId
    ) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register multiple transactions from operator (OperatorSubmitter only)
    /// @dev Bypasses two-phase flow for trusted operator submissions
    /// @param operatorId The operator's identifier
    /// @param transactionHashes Array of transaction hashes
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    /// @return batchId The created batch ID
    function registerTransactionsFromOperator(
        bytes32 operatorId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) external returns (uint256 batchId);

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE RECOVERY (Safety Hatch)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw fees held when hub was not configured
    /// @dev Only callable by owner. Sends entire contract balance to owner.
    function withdrawCollectedFees() external;

    /// @notice Withdraw fees to a specific recipient
    /// @dev Only callable by owner. Recovery path if owner address cannot receive ETH.
    /// @param recipient The address to receive the fees (must not be address(0))
    function withdrawTo(address recipient) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - CAIP-10 String Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a transaction is registered using chain-qualified reference
    /// @dev Format: "namespace:chainId:txHash" (similar to CAIP-10 but for transactions)
    /// @param chainQualifiedRef The chain-qualified transaction reference
    /// @return True if registered
    function isTransactionRegistered(string calldata chainQualifiedRef) external view returns (bool);

    /// @notice Get transaction entry using chain-qualified reference
    /// @param chainQualifiedRef The chain-qualified transaction reference
    /// @return The transaction entry data
    function getTransactionEntry(string calldata chainQualifiedRef) external view returns (TransactionEntry memory);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Typed Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a transaction is registered (gas-efficient overload)
    /// @param txHash The transaction hash
    /// @param chainId CAIP-2 chain ID hash (e.g., keccak256("eip155:8453"))
    /// @return True if registered
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool);

    /// @notice Get transaction entry using hash (gas-efficient overload)
    /// @param txHash The transaction hash
    /// @param chainId CAIP-2 chain ID hash
    /// @return The transaction entry data
    function getTransactionEntry(bytes32 txHash, bytes32 chainId) external view returns (TransactionEntry memory);

    /// @notice Check if a reporter has pending transaction acknowledgement
    /// @param reporter The reporter address
    /// @return True if pending
    function isTransactionPending(address reporter) external view returns (bool);

    /// @notice Get transaction acknowledgement data for a reporter
    /// @param reporter The reporter address
    /// @return The acknowledgement data
    function getTransactionAcknowledgementData(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory);

    /// @notice Get grace period timing info for a pending transaction registration
    /// @param reporter The reporter address
    /// @return currentBlock Current block number
    /// @return expiryBlock Block number when registration window closes
    /// @return startBlock Block number when registration window opens
    /// @return graceStartsAt Blocks remaining until registration window opens (0 if open)
    /// @return timeLeft Blocks remaining until expiry (0 if expired)
    /// @return isExpired True if the registration window has expired
    function getTransactionDeadlines(address reporter)
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

    /// @notice Generate hash struct for EIP-712 transaction batch signature
    /// @dev Uses msg.sender as the reporter address. Must be called by the actual reporter
    ///      so the resulting signature is valid for acknowledgeTransactionBatch/registerTransactionBatch.
    /// @param dataHash Hash of (txHashes, chainIds) being committed
    /// @param reportedChainId CAIP-2 chain ID hash where transactions occurred
    /// @param transactionCount Number of transactions in batch
    /// @param trustedForwarder The forwarder address authorized to complete registration
    /// @param step 1 for acknowledgement, 2 for registration
    /// @return deadline The deadline block number
    /// @return hashStruct The EIP-712 hash struct for signing
    function generateTransactionHashStruct(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address trustedForwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get nonce for a reporter
    /// @param reporter The reporter address
    /// @return The current nonce
    function nonces(address reporter) external view returns (uint256);

    /// @notice Get batch data
    /// @param batchId The batch ID
    /// @return The batch data
    function getTransactionBatch(uint256 batchId) external view returns (TransactionBatch memory);

    /// @notice Get current batch count
    /// @return The number of batches created
    function transactionBatchCount() external view returns (uint256);

    /// @notice Quote total fee required for registration
    /// @dev On hub: returns FeeManager's currentFeeWei(). On spoke: includes bridge fee.
    ///      Address parameter ignored on hub (kept for unified interface with spoke).
    /// @param reporter The reporter address (used by spoke for bridge quote accuracy)
    /// @return Total fee in wei
    function quoteRegistration(address reporter) external view returns (uint256);

    /// @notice Get detailed fee breakdown for registration
    /// @dev On hub: bridgeFee=0, bridgeName="". On spoke: includes bridge costs.
    ///      Address parameter ignored on hub (kept for unified interface with spoke).
    /// @param reporter The reporter address (used by spoke for bridge quote accuracy)
    /// @return breakdown Fee breakdown with bridge fee, registration fee, total, and bridge name
    function quoteFeeBreakdown(address reporter) external view returns (FeeBreakdown memory breakdown);

    /// @notice Get hub address
    /// @return The FraudRegistryHub address
    function hub() external view returns (address);

    /// @notice Get operator submitter address
    /// @return The OperatorSubmitter address
    function operatorSubmitter() external view returns (address);

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set or update hub address (owner-only, can be called multiple times)
    /// @param newHub The FraudRegistryHub address (must not be address(0))
    function setHub(address newHub) external;

    /// @notice Set operator submitter address
    /// @param newOperatorSubmitter The OperatorSubmitter address
    function setOperatorSubmitter(address newOperatorSubmitter) external;
}

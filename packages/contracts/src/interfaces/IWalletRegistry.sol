// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWalletRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Wallet Registry - handles two-phase wallet registration
/// @dev Extracted from FraudRegistryHub for contract size optimization
interface IWalletRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data for a registered wallet
    /// @dev Struct packed for gas efficiency: bytes32 fields first, then smaller types together
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param messageId Cross-chain message ID (0 for local registrations)
    /// @param registeredAt Block timestamp when wallet was registered
    /// @param incidentTimestamp Unix timestamp when incident occurred (0 if unknown)
    /// @param bridgeId Bridge protocol used (0 = local, 1 = Hyperlane, etc.)
    /// @param isSponsored Whether registration was gas-sponsored (relay/operator)
    struct WalletEntry {
        bytes32 reportedChainId;
        bytes32 sourceChainId;
        bytes32 messageId;
        uint64 registeredAt;
        uint64 incidentTimestamp;
        uint8 bridgeId;
        bool isSponsored;
    }

    /// @notice Acknowledgement data for pending registration
    /// @dev Struct packed for gas efficiency: uint256 fields first, then address+bool together
    /// @param deadline Block number deadline for completing registration
    /// @param nonce Nonce used for this acknowledgement
    /// @param gracePeriodStart Block number when grace period begins
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred (stored for register-phase validation)
    /// @param forwarder Address authorized to submit registration
    /// @param incidentTimestamp Unix timestamp when incident occurred (stored for register-phase validation)
    /// @param isSponsored Whether this is a sponsored registration
    struct AcknowledgementData {
        uint256 deadline;
        uint256 nonce;
        uint256 gracePeriodStart;
        bytes32 reportedChainId;
        address forwarder;
        uint64 incidentTimestamp;
        bool isSponsored;
    }

    /// @notice Batch registration data (for operator submissions)
    /// @param operatorId The operator who submitted this batch
    /// @param timestamp When the batch was submitted
    /// @param walletCount Number of wallets in the batch
    struct Batch {
        bytes32 operatorId;
        uint64 timestamp;
        uint32 walletCount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error WalletRegistry__AlreadyRegistered();
    error WalletRegistry__AlreadyAcknowledged();
    error WalletRegistry__NotAcknowledged();
    error WalletRegistry__DeadlineExpired();
    error WalletRegistry__DeadlineInPast();
    error WalletRegistry__GracePeriodNotStarted();
    error WalletRegistry__InvalidSignature();
    error WalletRegistry__InvalidSigner();
    error WalletRegistry__NotAuthorizedForwarder();
    error WalletRegistry__InsufficientFee();
    error WalletRegistry__FeeTransferFailed();
    error WalletRegistry__RefundFailed();
    error WalletRegistry__InvalidNonce();
    error WalletRegistry__ZeroAddress();
    error WalletRegistry__OnlyHub();
    error WalletRegistry__OnlyOperatorSubmitter();
    error WalletRegistry__EmptyBatch();
    error WalletRegistry__ArrayLengthMismatch();
    error WalletRegistry__InvalidStep();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet acknowledgement is submitted
    /// @param registeree The wallet being registered
    /// @param forwarder The address authorized to complete registration
    /// @param isSponsored Whether this is a sponsored registration
    event WalletAcknowledged(address indexed registeree, address indexed forwarder, bool isSponsored);

    /// @notice Emitted when a wallet registration is completed
    /// @param identifier The wallet identifier (bytes32 for CAIP-10 compatibility)
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred
    /// @param incidentTimestamp Unix timestamp when incident occurred
    /// @param isSponsored Whether registration was gas-sponsored
    event WalletRegistered(
        bytes32 indexed identifier, bytes32 indexed reportedChainId, uint64 incidentTimestamp, bool isSponsored
    );

    /// @notice Emitted when a wallet is registered via cross-chain message
    /// @param identifier The wallet identifier
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param bridgeId Bridge protocol ID
    /// @param messageId Cross-chain message ID
    event CrossChainWalletRegistered(
        bytes32 indexed identifier, bytes32 indexed sourceChainId, uint8 bridgeId, bytes32 messageId
    );

    /// @notice Emitted when an operator batch is created
    /// @param batchId The batch ID
    /// @param operatorId The operator ID
    /// @param walletCount Number of wallets in the batch
    event BatchCreated(uint256 indexed batchId, bytes32 indexed operatorId, uint32 walletCount);

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

    /// @notice Phase 1: Acknowledge intent to register a wallet
    /// @dev Creates a pending acknowledgement with grace period.
    ///      reportedChainId and incidentTimestamp are included in the EIP-712 signature
    ///      and stored in AcknowledgementData for validation during register().
    ///      isSponsored is derived as (registeree != forwarder).
    /// @param registeree The wallet address being registered
    /// @param forwarder The address authorized to complete registration (can be same as registeree)
    /// @param reportedChainId Raw EVM chain ID where incident occurred (uint64, converted to CAIP-2 hash internally)
    /// @param incidentTimestamp Unix timestamp when incident occurred (0 if unknown)
    /// @param deadline Timestamp deadline for the signature
    /// @param nonce Expected nonce for replay protection
    /// @param v ECDSA signature v component
    /// @param r ECDSA signature r component
    /// @param s ECDSA signature s component
    function acknowledge(
        address registeree,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2: Complete wallet registration after grace period
    /// @dev Must be called by authorized forwarder within deadline.
    ///      reportedChainId and incidentTimestamp must match values from acknowledge phase.
    /// @param registeree The wallet address being registered
    /// @param forwarder The address authorized to complete registration (must match acknowledge phase and msg.sender)
    /// @param reportedChainId Raw EVM chain ID where incident occurred (must match acknowledge phase)
    /// @param incidentTimestamp Unix timestamp when incident occurred (must match acknowledge phase)
    /// @param deadline Timestamp deadline for the signature
    /// @param nonce Expected nonce for replay protection
    /// @param v ECDSA signature v component
    /// @param r ECDSA signature r component
    /// @param s ECDSA signature s component
    function register(
        address registeree,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION (Hub Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register a wallet from cross-chain message (Hub only)
    /// @dev Called by FraudRegistryHub when processing cross-chain messages
    /// @param namespaceHash CAIP-2 namespace hash (e.g., keccak256("eip155"))
    /// @param chainRefHash CAIP-2 chain reference hash (ignored for EVM wallets due to wildcard key)
    /// @param identifier Wallet identifier (address as bytes32)
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred
    /// @param incidentTimestamp Unix timestamp when incident occurred
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param isSponsored Whether registration was gas-sponsored
    /// @param bridgeId Bridge protocol ID
    /// @param messageId Cross-chain message ID
    function registerFromHub(
        bytes32 namespaceHash,
        bytes32 chainRefHash,
        bytes32 identifier,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bytes32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 messageId
    ) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register multiple wallets from operator (OperatorSubmitter only)
    /// @dev Bypasses two-phase flow for trusted operator submissions
    /// @param operatorId The operator's identifier
    /// @param identifiers Array of wallet identifiers
    /// @param reportedChainIds Array of CAIP-2 chain ID hashes where incidents occurred
    /// @param incidentTimestamps Array of incident timestamps
    /// @return batchId The created batch ID
    function registerWalletsFromOperator(
        bytes32 operatorId,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external returns (uint256 batchId);

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE RECOVERY (Safety Hatch)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw fees held when hub was not configured
    /// @dev Only callable by owner. Sends entire contract balance to owner.
    function withdrawCollectedFees() external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - CAIP-10 String Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a wallet is registered using CAIP-10 string
    /// @dev Parses CAIP-10 format: "namespace:chainId:address"
    /// @param caip10 The CAIP-10 identifier (e.g., "eip155:8453:0x742d35...")
    /// @return True if registered
    function isWalletRegistered(string calldata caip10) external view returns (bool);

    /// @notice Get wallet entry using CAIP-10 string
    /// @param caip10 The CAIP-10 identifier
    /// @return The wallet entry data
    function getWalletEntry(string calldata caip10) external view returns (WalletEntry memory);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Typed EVM Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if an EVM wallet is registered (gas-efficient overload)
    /// @dev Uses wildcard key eip155:_:address for EVM wallets
    /// @param wallet The wallet address
    /// @return True if registered
    function isWalletRegistered(address wallet) external view returns (bool);

    /// @notice Get wallet entry using address (gas-efficient overload)
    /// @param wallet The wallet address
    /// @return The wallet entry data
    function getWalletEntry(address wallet) external view returns (WalletEntry memory);

    /// @notice Check if a wallet has pending acknowledgement
    /// @param wallet The wallet address
    /// @return True if pending
    function isWalletPending(address wallet) external view returns (bool);

    /// @notice Get acknowledgement data for a wallet
    /// @param wallet The wallet address
    /// @return The acknowledgement data
    function getAcknowledgementData(address wallet) external view returns (AcknowledgementData memory);

    /// @notice Get grace period timing info for a pending registration
    /// @param registeree The wallet address
    /// @return currentBlock Current block number
    /// @return expiryBlock Block number when registration window closes
    /// @return startBlock Block number when registration window opens
    /// @return graceStartsAt Blocks remaining until registration window opens (0 if open)
    /// @return timeLeft Blocks remaining until expiry (0 if expired)
    /// @return isExpired True if the registration window has expired
    function getDeadlines(address registeree)
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

    /// @notice Generate hash struct for EIP-712 signature generation
    /// @dev Uses msg.sender as the wallet address in the hash. Must be called by the actual
    ///      wallet owner so the resulting signature is valid for acknowledge/register.
    /// @param reportedChainId The chain ID where incident occurred (uint64 for gas efficiency)
    /// @param incidentTimestamp Unix timestamp of incident (0 if unknown)
    /// @param forwarder The forwarder address authorized to complete registration
    /// @param step 1 for acknowledgement, 2 for registration
    /// @return deadline The deadline block number
    /// @return hashStruct The EIP-712 hash struct for signing
    function generateHashStruct(uint64 reportedChainId, uint64 incidentTimestamp, address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get nonce for a wallet
    /// @param wallet The wallet address
    /// @return The current nonce
    function nonces(address wallet) external view returns (uint256);

    /// @notice Get batch data
    /// @param batchId The batch ID
    /// @return The batch data
    function getBatch(uint256 batchId) external view returns (Batch memory);

    /// @notice Get current batch count
    /// @return The number of batches created
    function batchCount() external view returns (uint256);

    /// @notice Quote total fee required for registration
    /// @dev On hub: returns FeeManager's currentFeeWei(). On spoke: includes bridge fee.
    ///      Address parameter ignored on hub (kept for unified interface with spoke).
    /// @param owner The wallet being registered (used by spoke for bridge quote accuracy)
    /// @return Total fee in wei
    function quoteRegistration(address owner) external view returns (uint256);

    /// @notice Get detailed fee breakdown for registration
    /// @dev On hub: bridgeFee=0, bridgeName="". On spoke: includes bridge costs.
    ///      Address parameter ignored on hub (kept for unified interface with spoke).
    /// @param owner The wallet being registered (used by spoke for bridge quote accuracy)
    /// @return breakdown Fee breakdown with bridge fee, registration fee, total, and bridge name
    function quoteFeeBreakdown(address owner) external view returns (FeeBreakdown memory breakdown);

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

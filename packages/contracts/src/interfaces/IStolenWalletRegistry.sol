// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStolenWalletRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Stolen Wallet Registry subregistry
/// @dev Implements two-phase registration: acknowledgement → grace period → registration
///      This prevents single-transaction phishing attacks by requiring two signatures
///      separated by a randomized time delay.
interface IStolenWalletRegistry {
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

    /// @notice Data stored for a pending acknowledgement (before registration completes)
    /// @param trustedForwarder Address authorized to submit the registration transaction
    /// @param startBlock Block number when grace period ends and registration can begin
    /// @param expiryBlock Block number after which the registration window closes
    struct AcknowledgementData {
        address trustedForwarder;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    /// @notice Data stored for a completed registration
    /// @dev Packed into 2 storage slots for gas efficiency
    ///      Privacy: registeredBy and registrationMethod removed to avoid revealing
    ///      multi-wallet ownership or relayer relationships.
    /// @param registeredAt Block number on hub when registration was finalized (uint64)
    /// @param sourceChainId EIP-155 chain ID where user signed (0 or hubChainId = native)
    /// @param bridgeId Which bridge delivered the message (BridgeId enum, NONE for native)
    /// @param isSponsored True if a third party paid gas on behalf of owner
    /// @param crossChainMessageId Bridge message ID for explorer linking (0x0 for native)
    struct RegistrationData {
        // === Slot 1 (packed - 14 bytes used) ===
        uint64 registeredAt; // Block number on hub (8 bytes)
        uint32 sourceChainId; // EIP-155 chain ID (4 bytes)
        uint8 bridgeId; // BridgeId enum (1 byte)
        bool isSponsored; // Third party paid gas (1 byte)
        // === Slot 2 ===
        bytes32 crossChainMessageId; // Bridge message ID (0x0 for native)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data stored for an operator-submitted wallet batch
    /// @param merkleRoot Root of wallet addresses + chainIds Merkle tree
    /// @param operator Address of the operator who submitted
    /// @param reportedChainId Primary chain for this batch (CAIP-2 bytes32)
    /// @param registeredAt Block number when registered
    /// @param walletCount Number of wallets in batch
    /// @param invalidated Soft delete flag for entire batch
    struct WalletBatch {
        bytes32 merkleRoot;
        address operator;
        bytes32 reportedChainId;
        uint64 registeredAt;
        uint32 walletCount;
        bool invalidated;
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

    /// @notice Thrown when the wallet is already registered
    error AlreadyRegistered();

    /// @notice Thrown when the owner address is the zero address
    error InvalidOwner();

    /// @notice Thrown when the provided fee is less than required
    error InsufficientFee();

    /// @notice Thrown when fee forwarding to RegistryHub fails
    error FeeForwardFailed();

    /// @notice Thrown when caller is not authorized (not RegistryHub for cross-chain registration)
    error UnauthorizedCaller();

    /// @notice Thrown when an invalid bridge ID is provided
    error InvalidBridgeId();

    /// @notice Thrown when source chain ID is invalid (e.g., zero for cross-chain registration)
    error InvalidChainId();

    /// @notice Thrown when timing configuration is invalid (graceBlocks=0, deadlineBlocks=0, or deadline <= grace)
    error InvalidTimingConfig();

    /// @notice Thrown when fee configuration is invalid (feeManager set without registryHub)
    error InvalidFeeConfig();

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when caller is not an approved operator with WALLET capability
    error StolenWalletRegistry__NotApprovedOperator();

    /// @notice Thrown when batch not found
    error StolenWalletRegistry__BatchNotFound();

    /// @notice Thrown when batch already registered
    error StolenWalletRegistry__BatchAlreadyRegistered();

    /// @notice Thrown when batch or entry already invalidated
    error StolenWalletRegistry__AlreadyInvalidated();

    /// @notice Thrown when entry is not invalidated (for reinstatement)
    error StolenWalletRegistry__EntryNotInvalidated();

    /// @notice Thrown when computed merkle root doesn't match provided root
    error StolenWalletRegistry__MerkleRootMismatch();

    /// @notice Thrown when array lengths don't match
    error StolenWalletRegistry__ArrayLengthMismatch();

    /// @notice Thrown when wallet count is zero
    error StolenWalletRegistry__InvalidWalletCount();

    /// @notice Thrown when merkle root is zero
    error StolenWalletRegistry__InvalidMerkleRoot();

    /// @notice Thrown when wallet address is zero
    error StolenWalletRegistry__InvalidWalletAddress();

    /// @notice Thrown when chain ID entry is zero
    error StolenWalletRegistry__InvalidChainIdEntry();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet owner acknowledges intent to register
    /// @param owner The wallet address being registered as stolen
    /// @param forwarder The address authorized to complete the registration
    /// @param isSponsored True if forwarder is different from owner (relayed registration)
    event WalletAcknowledged(address indexed owner, address indexed forwarder, bool indexed isSponsored);

    /// @notice Emitted when a wallet registration is finalized
    /// @param owner The wallet address that was registered as stolen
    /// @param isSponsored True if registration was submitted by a third party
    event WalletRegistered(address indexed owner, bool indexed isSponsored);

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when an operator registers a batch of stolen wallets
    event WalletBatchRegistered(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        address indexed operator,
        bytes32 reportedChainId,
        uint32 walletCount,
        address[] walletAddresses,
        bytes32[] chainIds
    );

    /// @notice Emitted when DAO invalidates an entire wallet batch
    event WalletBatchInvalidated(bytes32 indexed batchId, address indexed invalidatedBy);

    /// @notice Emitted when DAO invalidates a specific wallet entry
    event WalletEntryInvalidated(bytes32 indexed entryHash, address indexed invalidatedBy);

    /// @notice Emitted when DAO reinstates a previously invalidated wallet entry
    event WalletEntryReinstated(bytes32 indexed entryHash, address indexed reinstatedBy);

    /// @notice Emitted when operator registry address is set
    event OperatorRegistrySet(address indexed operatorRegistry);

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register a wallet from a cross-chain spoke registration
    /// @dev Only callable by the RegistryHub contract. Used for cross-chain registrations
    ///      where the two-phase flow already completed on the spoke chain.
    /// @param wallet The wallet address to register as stolen
    /// @param sourceChainId EIP-155 chain ID where registration originated
    /// @param isSponsored True if a third party paid gas on behalf of owner
    /// @param bridgeId Which bridge delivered the message (BridgeId enum)
    /// @param crossChainMessageId Bridge message ID for explorer linking
    function registerFromHub(
        address wallet,
        uint32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external;

    /// @notice Phase 1: Submit acknowledgement of intent to register a wallet as stolen
    /// @dev Creates a trusted forwarder relationship and starts the grace period.
    ///      The owner must sign an EIP-712 message authorizing this submission.
    ///      Nonce is incremented after successful acknowledgement.
    /// @param deadline Timestamp after which the signature is no longer valid
    /// @param nonce Owner's current nonce (must match contract state)
    /// @param owner Address of the wallet being registered as stolen
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    // solhint-disable-next-line max-line-length
    function acknowledge(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external payable;

    /// @notice Phase 2: Complete the registration after grace period
    /// @dev Must be called by the same forwarder that was authorized in acknowledge().
    ///      Must be called after grace period starts but before it expires.
    ///      Nonce is incremented after successful registration.
    ///      Forwarder data is deleted after successful registration.
    /// @param deadline Timestamp after which the signature is no longer valid
    /// @param nonce Owner's current nonce (must match contract state)
    /// @param owner Address of the wallet being registered as stolen
    /// @param v ECDSA signature component
    /// @param r ECDSA signature component
    /// @param s ECDSA signature component
    function register(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary Query Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a wallet has completed registration as stolen
    /// @param wallet The address to query
    /// @return True if the wallet is registered as stolen
    function isRegistered(address wallet) external view returns (bool);

    /// @notice Check if a wallet has a pending acknowledgement awaiting registration
    /// @param wallet The address to query
    /// @return True if there is a pending acknowledgement for this wallet
    function isPending(address wallet) external view returns (bool);

    /// @notice Get full registration data for a registered wallet
    /// @param wallet The address to query
    /// @return data The registration data (zeroed struct if not registered)
    function getRegistration(address wallet) external view returns (RegistrationData memory data);

    /// @notice Get pending acknowledgement data for a wallet
    /// @param wallet The address to query
    /// @return data The acknowledgement data (zeroed struct if no pending acknowledgement)
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory data);

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

    /// @notice Get the current nonce for a wallet owner
    /// @param owner The address to query
    /// @return The current nonce value
    function nonces(address owner) external view returns (uint256);

    /// @notice Generate hash struct for EIP-712 signature
    /// @dev Used by frontend to prepare typed data for signing.
    ///      SECURITY: Uses msg.sender as the owner in the hash struct. This prevents
    ///      malicious actors from creating valid signatures for wallets they don't control.
    ///      The signer MUST be the wallet owner calling this function.
    /// @param forwarder The address that will submit the transaction
    /// @param step 1 for acknowledgement, any other value for registration
    /// @return deadline The signature expiry timestamp
    /// @return hashStruct The EIP-712 hash struct to sign
    function generateHashStruct(address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get grace period timing information for a pending acknowledgement
    /// @dev Preserves return signature for frontend compatibility
    /// @param session The wallet address to query
    /// @return currentBlock Current block number
    /// @return expiryBlock Block when registration window closes
    /// @return startBlock Block when grace period ends (registration can begin)
    /// @return graceStartsAt Blocks remaining until grace period ends (0 if already passed)
    /// @return timeLeft Blocks remaining until registration expires (0 if expired)
    /// @return isExpired True if the registration window has closed
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

    /// @notice Quote total cost for registration
    /// @dev On hub chain, returns only the registration fee (no bridge fee).
    ///      This matches SpokeRegistry.quoteRegistration() interface for frontend compatibility.
    /// @param owner The wallet being registered (unused on hub, included for interface compatibility)
    /// @return Total fee required in native token
    function quoteRegistration(address owner) external view returns (uint256);

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register a batch of stolen wallets (operator only, single-phase)
    /// @dev Operators bypass the two-phase registration since they're DAO-vetted.
    ///      Uses Merkle tree for efficient batch verification.
    /// @param merkleRoot Root of Merkle tree built from wallet addresses + chainIds
    /// @param reportedChainId Primary chain for this batch (CAIP-2 format)
    /// @param walletAddresses Array of stolen wallet addresses
    /// @param chainIds Array of chain IDs (CAIP-2 bytes32) for each wallet
    function registerBatchAsOperator(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address[] calldata walletAddresses,
        bytes32[] calldata chainIds
    ) external payable;

    /// @notice Check if a wallet batch exists and is valid (not invalidated)
    /// @param batchId The batch ID to check
    /// @return True if batch exists and is not invalidated
    function isWalletBatchRegistered(bytes32 batchId) external view returns (bool);

    /// @notice Get wallet batch data
    /// @param batchId The batch ID to query
    /// @return The WalletBatch struct
    function getWalletBatch(bytes32 batchId) external view returns (WalletBatch memory);

    /// @notice Verify a wallet is in a batch using merkle proof
    /// @param wallet The wallet address to verify
    /// @param chainId The chain ID (CAIP-2 bytes32)
    /// @param batchId The batch to check against
    /// @param merkleProof The merkle proof for verification
    /// @return True if wallet is in the batch and neither batch nor entry is invalidated
    function verifyWalletInBatch(address wallet, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool);

    /// @notice Compute batch ID from parameters
    /// @param merkleRoot The merkle root
    /// @param operator The operator address
    /// @param reportedChainId The primary chain ID
    /// @return The computed batch ID
    function computeWalletBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        external
        pure
        returns (bytes32);

    /// @notice Compute entry hash for a wallet
    /// @param wallet The wallet address
    /// @param chainId The chain ID
    /// @return The entry hash
    function computeWalletEntryHash(address wallet, bytes32 chainId) external pure returns (bytes32);

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALIDATION FUNCTIONS (DAO only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Invalidate an operator batch (DAO only)
    /// @param batchId The batch ID to invalidate
    function invalidateWalletBatch(bytes32 batchId) external;

    /// @notice Invalidate a specific wallet entry (DAO only)
    /// @param entryHash keccak256(abi.encodePacked(wallet, chainId))
    function invalidateWalletEntry(bytes32 entryHash) external;

    /// @notice Reinstate a previously invalidated entry (DAO only)
    /// @param entryHash The entry hash to reinstate
    function reinstateWalletEntry(bytes32 entryHash) external;

    /// @notice Check if wallet entry is invalidated
    /// @param entryHash The entry hash to check
    /// @return True if entry is invalidated
    function isWalletEntryInvalidated(bytes32 entryHash) external view returns (bool);

    /// @notice Set operator registry address (owner only)
    /// @param _operatorRegistry The operator registry address
    function setOperatorRegistry(address _operatorRegistry) external;

    /// @notice Get operator registry address
    /// @return The operator registry address
    function operatorRegistry() external view returns (address);

    /// @notice Quote operator batch registration fee
    /// @return Fee in wei
    function quoteOperatorBatchRegistration() external view returns (uint256);
}

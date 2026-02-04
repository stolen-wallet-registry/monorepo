// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFraudRegistryV2
/// @author Stolen Wallet Registry Team
/// @notice Interface for the V2 Fraud Registry with simplified direct storage
/// @dev Uses direct mappings instead of merkle proofs, with CAIP-363-inspired
///      wildcard keys for EVM wallets. This enables simple on-chain verification:
///      `isEvmWalletRegistered(address) -> bool`
///
///      Key design decisions:
///      - Storage key uses wildcard (eip155:_:wallet) for universal EVM lookups
///      - Storage struct includes namespace + reportedChainId for off-chain CAIP-10 reconstruction
///      - Per-entry events (not giant arrays) for efficient indexing
///      - Privacy: Never emit relayer addresses for individual submissions
///      - Timestamps use block.timestamp for cross-chain compatibility
interface IFraudRegistryV2 {
    // ═══════════════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Supported blockchain namespaces (CAIP-2 compliant)
    /// @dev Using enum (1 byte) instead of string for gas efficiency.
    ///      CAIP-10 string formatting should be done OFF-CHAIN to avoid gas costs.
    enum Namespace {
        EIP155, // 0 - EVM chains (Ethereum, Base, Optimism, Arbitrum, etc.)
        SOLANA, // 1 - Solana (future)
        COSMOS, // 2 - Cosmos ecosystem (future)
        BIP122 // 3 - Bitcoin (future)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet entry for wallets across ALL blockchains
    /// @dev Cross-blockchain compatible: works for EVM, Solana, Bitcoin, Cosmos, etc.
    ///      Storage key computed via CAIP10.walletKey(namespaceHash, chainRef, identifier)
    ///        - EVM (eip155): Uses WILDCARD key (same wallet on all EVM chains)
    ///        - Other chains: Uses chain-specific key
    ///
    ///      Storage optimization: reportedChainIdHash is a TRUNCATED hash (top 64 bits of
    ///      keccak256(caip2String)). With ~18 quintillion possible values and only thousands
    ///      of chains, collision probability is effectively zero. Full chain info is emitted
    ///      in events for indexers.
    ///
    ///      Total: 1 + 8 + 8 + 8 + 4 + 1 = 30 bytes (fits in 1 storage slot!)
    ///
    /// @param namespace CAIP-2 namespace enum (EIP155, SOLANA, etc.)
    /// @param reportedChainIdHash Truncated CAIP-2 hash where incident reported
    ///        (e.g., uint64(keccak256("eip155:8453") >> 192))
    /// @param incidentTimestamp When theft occurred (user-provided, Unix timestamp)
    /// @param registeredAtTimestamp block.timestamp when registered
    /// @param firstBatchId First batch that included this (0 if individual)
    /// @param invalidated DAO can invalidate
    struct WalletEntry {
        Namespace namespace; // 1 byte
        uint64 reportedChainIdHash; // 8 bytes - truncated CAIP-2 hash for cross-blockchain support
        uint64 incidentTimestamp; // 8 bytes
        uint64 registeredAtTimestamp; // 8 bytes
        uint32 firstBatchId; // 4 bytes
        bool invalidated; // 1 byte
    }

    /// @notice Transaction entry - minimal on-chain storage
    /// @dev 8 + 4 + 1 = 13 bytes (fits in 1 slot)
    /// @param registeredAtTimestamp block.timestamp when registered
    /// @param firstBatchId Batch ID for lookup (0 if individual single-tx)
    /// @param invalidated DAO can invalidate
    struct TransactionEntry {
        uint64 registeredAtTimestamp;
        uint32 firstBatchId;
        bool invalidated;
    }

    /// @notice Contract entry - minimal on-chain storage
    /// @dev 8 + 4 + 1 = 13 bytes (fits in 1 slot)
    /// @param registeredAtTimestamp block.timestamp when registered
    /// @param firstBatchId Batch ID (contracts are operator-only batches)
    /// @param invalidated DAO can invalidate
    struct ContractEntry {
        uint64 registeredAtTimestamp;
        uint32 firstBatchId;
        bool invalidated;
    }

    /// @notice Batch metadata for on-chain lookup
    /// @dev PRIVACY: submitter is ONLY set for operator batches, address(0) for individuals
    /// @param submitter Who submitted (address(0) for individuals to protect privacy)
    /// @param createdAtTimestamp block.timestamp when created
    /// @param entryCount Number of entries in batch
    /// @param isOperator Was submitter an approved operator?
    struct Batch {
        address submitter;
        uint64 createdAtTimestamp;
        uint32 entryCount;
        bool isOperator;
    }

    /// @notice Pending acknowledgement data for two-phase registration
    /// @param trustedForwarder Address authorized to complete registration
    /// @param startBlock Block when grace period ends (registration can begin)
    /// @param expiryBlock Block when registration window closes
    struct AcknowledgementData {
        address trustedForwarder;
        uint256 startBlock;
        uint256 expiryBlock;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS - Wallet Registry
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted for EACH wallet registration (individual or in batch)
    /// @dev PRIVACY: Never emit relayer address - only emit isSponsored bool.
    ///      Storage key uses wildcard (eip155:_:wallet), event includes chain hash.
    ///      reportedChainIdHash is truncated CAIP-2 hash (top 64 bits of keccak256(caip2String))
    /// @param wallet The stolen wallet being registered
    /// @param namespace EIP155 (EVM EOAs only for now)
    /// @param reportedChainIdHash Truncated CAIP-2 hash where reported
    /// @param incidentTimestamp When theft occurred (user-provided)
    /// @param isSponsored True if third party paid (hides relayer identity)
    /// @param batchId 0 if individual submission, >0 if part of batch
    event WalletRegistered(
        address indexed wallet,
        Namespace namespace,
        uint64 reportedChainIdHash,
        uint64 incidentTimestamp,
        bool isSponsored,
        uint32 batchId
    );

    /// @notice Emitted when a wallet owner acknowledges intent to register
    /// @param wallet The wallet address being registered
    /// @param forwarder The address authorized to complete registration
    /// @param isSponsored True if forwarder is different from wallet owner
    event WalletAcknowledged(address indexed wallet, address indexed forwarder, bool indexed isSponsored);

    /// @notice Emitted when same wallet flagged by additional operator
    /// @dev Only emitted for OPERATOR submissions (they're public).
    ///      Individual re-submissions silently succeed (privacy).
    /// @param wallet The wallet address
    /// @param namespace The namespace
    /// @param reportedChainIdHash Truncated CAIP-2 hash where reported
    /// @param operator Operator address (public entity)
    /// @param batchId The batch ID
    event WalletOperatorSourceAdded(
        address indexed wallet,
        Namespace namespace,
        uint64 reportedChainIdHash,
        address indexed operator,
        uint32 batchId
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS - Transaction Registry
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted for EACH transaction registration
    /// @dev PRIVACY: Never emit reporter address - they may have used relay
    /// @param txHash The transaction hash
    /// @param chainId The chain ID (bytes32 for CAIP-2 compatibility)
    /// @param isSponsored True if third party paid
    /// @param batchId 0 if individual, >0 if part of batch
    event TransactionRegistered(bytes32 indexed txHash, bytes32 indexed chainId, bool isSponsored, uint32 batchId);

    /// @notice Emitted when same tx flagged by additional operator
    /// @param txHash The transaction hash
    /// @param chainId The chain ID
    /// @param operator The operator address
    /// @param batchId The batch ID
    event TransactionOperatorSourceAdded(
        bytes32 indexed txHash, bytes32 indexed chainId, address indexed operator, uint32 batchId
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS - Contract Registry
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted for EACH contract registration
    /// @param contractAddr The contract address
    /// @param chainId The chain ID
    /// @param operator The operator (contracts are operator-only)
    /// @param batchId The batch ID
    event ContractRegistered(
        address indexed contractAddr, bytes32 indexed chainId, address indexed operator, uint32 batchId
    );

    /// @notice Emitted when same contract flagged by additional operator
    /// @param contractAddr The contract address
    /// @param chainId The chain ID
    /// @param operator The operator address
    /// @param batchId The batch ID
    event ContractOperatorSourceAdded(
        address indexed contractAddr, bytes32 indexed chainId, address indexed operator, uint32 batchId
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS - Batch
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted ONCE per batch (summary event for indexer)
    /// @dev Contains batch metadata only, NOT the full entry arrays
    /// @param batchId The batch ID
    /// @param operator address(0) for individual, operator address for operator batches
    /// @param entryCount Number of entries
    /// @param isOperator Was this an operator submission
    event BatchCreated(uint32 indexed batchId, address indexed operator, uint32 entryCount, bool isOperator);

    /// @notice Emitted when operator registry is set
    /// @param operatorRegistry The new operator registry address
    event OperatorRegistrySet(address indexed operatorRegistry);

    /// @notice Emitted when operator submitter is set
    /// @param operatorSubmitter The new operator submitter address
    event OperatorSubmitterSet(address indexed operatorSubmitter);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error FraudRegistryV2__InvalidWallet();
    error FraudRegistryV2__InvalidNonce();
    error FraudRegistryV2__SignatureExpired();
    error FraudRegistryV2__InvalidSignature();
    error FraudRegistryV2__InvalidForwarder();
    error FraudRegistryV2__GracePeriodNotStarted();
    error FraudRegistryV2__RegistrationExpired();
    error FraudRegistryV2__AlreadyRegistered();
    error FraudRegistryV2__InvalidTimingConfig();
    error FraudRegistryV2__InvalidFeeConfig();
    error FraudRegistryV2__InsufficientFee();
    error FraudRegistryV2__FeeForwardFailed();
    error FraudRegistryV2__ExcessRefundFailed();
    error FraudRegistryV2__InvalidCaip10Format();
    error FraudRegistryV2__UnsupportedNamespace();
    error FraudRegistryV2__UnauthorizedInbox();
    error FraudRegistryV2__UnauthorizedOperatorSubmitter();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS - Cross-Chain
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet is registered via cross-chain message from hub
    /// @dev Uses bytes32 identifier for cross-BLOCKCHAIN compatibility (EVM, Solana, Bitcoin, etc.)
    /// @param namespaceHash Hash of namespace (keccak256("eip155"), keccak256("solana"), etc.)
    /// @param identifier Wallet identifier as bytes32 (address for EVM, pubkey for Solana)
    /// @param sourceChainId CAIP-2 hash of chain where registration was submitted
    /// @param reportedChainId CAIP-2 hash of chain where incident occurred
    /// @param incidentTimestamp When theft occurred
    /// @param bridgeId Bridge protocol used (1 = Hyperlane)
    /// @param crossChainMessageId Unique message identifier from bridge
    event CrossChainWalletRegistered(
        bytes32 indexed namespaceHash,
        bytes32 indexed identifier,
        bytes32 sourceChainId,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    );

    /// @notice Emitted when registry hub is updated
    /// @param crossChainInbox The new registry hub address
    event CrossChainInboxSet(address indexed crossChainInbox);

    /// @notice Emitted when a transaction batch is registered via cross-chain message
    /// @param reporter Address that submitted the registration on spoke
    /// @param dataHash Hash of (txHashes, chainIds) - signature commitment
    /// @param sourceChainId CAIP-2 hash of chain where registration was submitted
    /// @param reportedChainId CAIP-2 hash where transactions occurred
    /// @param transactionCount Number of transactions in batch
    /// @param bridgeId Bridge protocol used (1 = Hyperlane)
    /// @param crossChainMessageId Unique message identifier from bridge
    event CrossChainTransactionBatchRegistered(
        address indexed reporter,
        bytes32 indexed dataHash,
        bytes32 sourceChainId,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary CAIP-10 Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if identifier is registered (CAIP-10 string interface)
    /// @dev Parses CAIP-10 string and routes to appropriate storage.
    ///      Supports wildcards for EVM: "eip155:_:0x..." checks all EVM chains.
    /// @param caip10 CAIP-10 identifier (e.g., "eip155:8453:0x...", "eip155:_:0x...")
    /// @return registered True if registered and not invalidated
    /// @custom:examples
    ///   isRegistered("eip155:8453:0x742d35...")  // Specific chain (Base)
    ///   isRegistered("eip155:_:0x742d35...")     // Wildcard (any EVM chain)
    function isRegistered(string calldata caip10) external view returns (bool registered);

    /// @notice Check if identifier is pending registration (CAIP-10 string interface)
    /// @dev Only applicable to wallets (two-phase registration)
    /// @param caip10 CAIP-10 identifier
    /// @return pending True if pending acknowledgement exists and not expired
    function isPending(string calldata caip10) external view returns (bool pending);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - EVM Address Overloads (Soulbound Compatibility)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if EVM wallet is registered (address overload for Soulbound)
    /// @dev Convenience function that uses wildcard internally: isRegistered("eip155:_:{wallet}")
    ///      This maintains backward compatibility with WalletSoulbound.sol
    /// @param wallet EOA wallet address
    /// @return registered True if registered and not invalidated
    function isRegistered(address wallet) external view returns (bool registered);

    /// @notice Check if EVM wallet is pending (address overload for Soulbound)
    /// @dev Convenience function that uses wildcard internally: isPending("eip155:_:{wallet}")
    ///      This maintains backward compatibility with WalletSoulbound.sol
    /// @param wallet EOA wallet address
    /// @return pending True if pending acknowledgement exists and not expired
    function isPending(address wallet) external view returns (bool pending);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Direct Registry Lookups (Internal Use)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if transaction is registered as fraudulent
    /// @param txHash The transaction hash
    /// @param chainId The chain ID (bytes32 for CAIP-2)
    /// @return registered True if registered and not invalidated
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool registered);

    /// @notice Check if contract is registered as malicious
    /// @param contractAddr The contract address
    /// @param chainId The chain ID (bytes32 for CAIP-2)
    /// @return registered True if registered and not invalidated
    function isContractRegistered(address contractAddr, bytes32 chainId) external view returns (bool registered);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Extended Queries
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get EVM wallet registration details with chain info
    /// @dev Returns raw values - format CAIP-10 strings off-chain to save gas.
    ///      reportedChainIdHash is truncated CAIP-2 hash (verify with CAIP10.truncatedEvmChainIdHash(chainId))
    /// @param wallet The wallet address
    /// @return registered Whether wallet is registered and not invalidated
    /// @return namespace The namespace (EIP155)
    /// @return reportedChainIdHash Truncated CAIP-2 hash where reported
    /// @return incidentTimestamp When theft occurred
    /// @return registeredAtTimestamp When registered
    /// @return batchId The batch ID (0 if individual)
    function getEvmWalletDetails(address wallet)
        external
        view
        returns (
            bool registered,
            Namespace namespace,
            uint64 reportedChainIdHash,
            uint64 incidentTimestamp,
            uint64 registeredAtTimestamp,
            uint32 batchId
        );

    /// @notice Get pending acknowledgement data
    /// @param wallet The wallet address
    /// @return data The acknowledgement data (zeroed if none)
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory data);

    /// @notice Get batch metadata
    /// @param batchId The batch ID
    /// @return batch The batch data
    function getBatch(uint32 batchId) external view returns (Batch memory batch);

    /// @notice Get current nonce for a wallet
    /// @param wallet The wallet address
    /// @return nonce The current nonce
    function nonces(address wallet) external view returns (uint256 nonce);

    /// @notice Get the next batch ID
    /// @return nextId The next batch ID
    function nextBatchId() external view returns (uint32 nextId);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Generate hash struct for EIP-712 signature
    /// @dev Used by frontend to prepare typed data for signing
    /// @param forwarder The address that will submit the transaction
    /// @param step 1 for acknowledgement, 2 for registration
    /// @return deadline The signature expiry timestamp
    /// @return hashStruct The EIP-712 hash struct to sign
    function generateHashStruct(address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct);

    /// @notice Get timing information for a pending acknowledgement
    /// @param wallet The wallet address
    /// @return currentBlock Current block number
    /// @return expiryBlock Block when registration window closes
    /// @return startBlock Block when grace period ends
    /// @return graceStartsAt Blocks until grace period ends (0 if passed)
    /// @return timeLeft Blocks until expiry (0 if expired)
    /// @return isExpired True if registration window closed
    function getDeadlines(address wallet)
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

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Individual Wallet Registration (Two-Phase)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1: Acknowledge intent to register wallet as stolen
    /// @dev Creates trusted forwarder relationship and starts grace period.
    ///      Signature must be from the wallet being registered.
    ///      Fee is collected during registration phase, not acknowledgement.
    ///      Hub only supports EVM wallets for individual registration.
    /// @param wallet The wallet address being registered
    /// @param reportedChainId Chain ID where reporting (e.g., 8453 for Base)
    /// @param incidentTimestamp When theft occurred (Unix timestamp)
    /// @param deadline Signature expiry timestamp
    /// @param v ECDSA v
    /// @param r ECDSA r
    /// @param s ECDSA s
    function acknowledge(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Phase 2: Complete wallet registration after grace period
    /// @dev Must be called by the trusted forwarder from acknowledgement.
    ///      Must be after grace period but before expiry.
    ///      Fee is collected during this phase via msg.value.
    ///      Hub only supports EVM wallets for individual registration.
    /// @param wallet The wallet address being registered
    /// @param reportedChainId Chain ID (must match acknowledgement)
    /// @param incidentTimestamp Incident timestamp (must match acknowledgement)
    /// @param deadline Signature expiry timestamp
    /// @param v ECDSA v
    /// @param r ECDSA r
    /// @param s ECDSA s
    function register(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Trusted Caller Registration (OperatorSubmitter)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register batch of wallets from OperatorSubmitter (trusted caller)
    /// @dev Only callable by operatorSubmitter. OperatorSubmitter validates operator permissions.
    ///      Supports EVM, Solana, Bitcoin, Cosmos - any CAIP-10 namespace.
    /// @param operator The operator address (for events and batch metadata)
    /// @param namespaceHashes Array of namespace hashes (CAIP10.NAMESPACE_EIP155, etc.)
    /// @param chainRefs Array of chain reference hashes (ignored for EVM wallets)
    /// @param identifiers Array of wallet identifiers as bytes32
    /// @param reportedChainIds Array of CAIP-2 hashes where each was reported
    /// @param incidentTimestamps Array of incident timestamps
    /// @return batchId The created batch ID
    function registerWalletsFromOperator(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external returns (uint32 batchId);

    /// @notice Register batch of transactions from OperatorSubmitter (trusted caller)
    /// @dev Only callable by operatorSubmitter. OperatorSubmitter validates operator permissions.
    /// @param operator The operator address (for events and batch metadata)
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param txHashes Array of transaction hashes/signatures as bytes32
    /// @return batchId The created batch ID
    function registerTransactionsFromOperator(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata txHashes
    ) external returns (uint32 batchId);

    /// @notice Register batch of contracts from OperatorSubmitter (trusted caller)
    /// @dev Only callable by operatorSubmitter. OperatorSubmitter validates operator permissions.
    /// @param operator The operator address (for events and batch metadata)
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param contractIds Array of contract identifiers as bytes32
    /// @return batchId The created batch ID
    function registerContractsFromOperator(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata contractIds
    ) external returns (uint32 batchId);

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Cross-Chain Registration (Hub Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register wallet from cross-chain message via CrossChainInbox
    /// @dev Only callable by crossChainInbox. Bypasses two-phase since spoke validated.
    ///      Uses bytes32 parameters for cross-BLOCKCHAIN compatibility (EVM, Solana, Bitcoin, etc.)
    ///      The spoke has already validated signatures - hub just computes storage key and stores.
    ///
    ///      Storage key computation (via CAIP10 library):
    ///        - EVM (eip155): Uses WILDCARD key, chainRef ignored
    ///        - Other chains: Uses chain-specific key with chainRef
    ///
    /// @param namespaceHash Hash of namespace (CAIP10.NAMESPACE_EIP155, CAIP10.NAMESPACE_SOLANA, etc.)
    /// @param chainRef Hash of chain reference (ignored for EVM, used for Solana/Bitcoin/etc.)
    /// @param identifier Wallet identifier as bytes32 (address padded for EVM, pubkey for Solana)
    /// @param reportedChainId CAIP-2 hash of chain where incident occurred
    /// @param incidentTimestamp When theft occurred (Unix timestamp)
    /// @param sourceChainId CAIP-2 hash of chain where registration was submitted
    /// @param isSponsored True if third party paid gas on spoke
    /// @param bridgeId Bridge protocol used (1 = Hyperlane)
    /// @param crossChainMessageId Unique message identifier from bridge
    function registerFromSpoke(
        bytes32 namespaceHash,
        bytes32 chainRef,
        bytes32 identifier,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bytes32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external;

    /// @notice Register transaction batch from cross-chain message via CrossChainInbox
    /// @dev Only callable by crossChainInbox. Bypasses two-phase since spoke validated.
    ///      The spoke has already validated signatures and data integrity via dataHash.
    /// @param reporter Address that submitted the registration on spoke
    /// @param dataHash Hash of (txHashes, chainIds) - verified on spoke
    /// @param reportedChainId CAIP-2 hash of chain where transactions occurred
    /// @param sourceChainId CAIP-2 hash of chain where registration was submitted
    /// @param isSponsored True if third party paid gas on spoke
    /// @param transactionHashes Array of transaction hashes
    /// @param chainIds Parallel array of CAIP-2 chain IDs per transaction
    /// @param bridgeId Bridge protocol used (1 = Hyperlane)
    /// @param crossChainMessageId Unique message identifier from bridge
    function registerTransactionsFromSpoke(
        address reporter,
        bytes32 dataHash,
        bytes32 reportedChainId,
        bytes32 sourceChainId,
        bool isSponsored,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - DAO Controls
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set the operator registry address
    /// @param _operatorRegistry The operator registry address
    function setOperatorRegistry(address _operatorRegistry) external;

    /// @notice Set the operator submitter address
    /// @param _operatorSubmitter The operator submitter address (address(0) to disable)
    function setOperatorSubmitter(address _operatorSubmitter) external;

    /// @notice Set the registry hub address for cross-chain registrations
    /// @param _crossChainInbox The registry hub address (address(0) to disable)
    function setCrossChainInbox(address _crossChainInbox) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Fee Configuration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Quote individual registration fee
    /// @dev Returns 0 if feeManager is not set (free registrations)
    /// @return fee Fee required in native token (wei)
    function quoteRegistration() external view returns (uint256 fee);

    /// @notice Get fee manager address
    /// @return address(0) = free registrations, otherwise FeeManager contract
    function feeManager() external view returns (address);

    /// @notice Get fee recipient address
    /// @return Where fees are forwarded (CrossChainInbox or treasury)
    function feeRecipient() external view returns (address);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIG GETTERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get operator registry address
    /// @return The operator registry address
    function operatorRegistry() external view returns (address);

    /// @notice Get operator submitter address
    /// @return The operator submitter address (address(0) = operator batch disabled)
    function operatorSubmitter() external view returns (address);

    /// @notice Get registry hub address for cross-chain registrations
    /// @return The registry hub address (address(0) = cross-chain disabled)
    function crossChainInbox() external view returns (address);

    /// @notice Get grace period blocks
    /// @return The grace period in blocks
    function graceBlocks() external view returns (uint256);

    /// @notice Get deadline blocks
    /// @return The deadline window in blocks
    function deadlineBlocks() external view returns (uint256);
}

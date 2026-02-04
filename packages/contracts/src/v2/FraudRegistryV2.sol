// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { IFraudRegistryV2 } from "./interfaces/IFraudRegistryV2.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CAIP10 } from "./libraries/CAIP10.sol";
import { CAIP10Evm } from "./libraries/CAIP10Evm.sol";

/// @title FraudRegistryV2
/// @author Stolen Wallet Registry Team
/// @notice Unified fraud registry with simplified direct storage (no merkle proofs)
/// @dev Key features:
///      - CAIP-10 string interface with internal parsing
///      - CAIP-363-inspired wildcard keys for EVM wallets (eip155:_:wallet)
///      - Direct storage mappings for O(1) verification
///      - Two-phase registration for wallets (anti-phishing)
///      - Single-phase batch registration for operators
///      - Per-entry events for efficient indexing
///      - Privacy: Never emit relayer addresses for individual submissions
///      - FeeManager integration for USD-denominated fees
///      - Soulbound compatibility via isRegistered(address) overload
contract FraudRegistryV2 is IFraudRegistryV2, EIP712, Ownable2Step, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Human-readable statement for acknowledgement (displayed in MetaMask)
    string private constant ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry V2.";

    /// @dev Human-readable statement for registration (displayed in MetaMask)
    string private constant REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry V2. This action is irreversible.";

    /// @dev EIP-712 type hash for acknowledgement phase
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    /// @dev EIP-712 type hash for registration phase
    bytes32 private constant REGISTRATION_TYPEHASH = keccak256(
        "Registration(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Base blocks for grace period (chain-specific)
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for deadline window (chain-specific)
    uint256 public immutable deadlineBlocks;

    /// @notice Fee manager address (address(0) = free registrations)
    address public immutable feeManager;

    /// @notice Where fees are forwarded (CrossChainInbox or treasury)
    address public immutable feeRecipient;

    // ═══════════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet entries: storage key => WalletEntry
    /// @dev Key computation depends on namespace:
    ///      - EVM: CAIP10.evmWalletKey(wallet) = wildcard key (same wallet on all EVM chains)
    ///      - Other: CAIP10.walletKey(namespaceHash, chainRef, identifier) = chain-specific key
    mapping(bytes32 => WalletEntry) private _wallets;

    /// @notice Transaction entries: key => TransactionEntry
    /// @dev Key = CAIP10.txStorageKey(txHash, chainId) where chainId is CAIP-2 hash
    mapping(bytes32 => TransactionEntry) private _transactions;

    /// @notice Contract entries: key => ContractEntry
    /// @dev Key = CAIP10.contractStorageKey(contractAddr, chainId) where chainId is CAIP-2 hash
    mapping(bytes32 => ContractEntry) private _contracts;

    /// @notice Batch metadata
    mapping(uint32 => Batch) private _batches;

    /// @notice Next batch ID
    uint32 public nextBatchId = 1;

    /// @notice Pending acknowledgements for two-phase registration
    mapping(address => AcknowledgementData) private _pendingAcknowledgements;

    /// @notice Nonces for replay protection (keyed to SIGNER, not msg.sender)
    mapping(address => uint256) public nonces;

    /// @notice Operator registry address (for permission checks)
    address public operatorRegistry;

    /// @notice Operator submitter contract address (address(0) = disabled)
    address public operatorSubmitter;

    /// @notice Registry hub address for cross-chain registrations (address(0) = disabled)
    address public crossChainInbox;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the V2 registry
    /// @param _owner Initial owner (DAO multisig)
    /// @param _operatorRegistry Operator registry address
    /// @param _feeManager FeeManager contract address (address(0) for free registrations)
    /// @param _feeRecipient Where fees go (CrossChainInbox or treasury)
    /// @param _graceBlocks Base blocks for grace period
    /// @param _deadlineBlocks Base blocks for deadline window
    constructor(
        address _owner,
        address _operatorRegistry,
        address _feeManager,
        address _feeRecipient,
        uint256 _graceBlocks,
        uint256 _deadlineBlocks
    ) EIP712("FraudRegistryV2", "1") Ownable(_owner) {
        // Validate fee configuration: if feeManager is set, feeRecipient must also be set
        if (_feeManager != address(0) && _feeRecipient == address(0)) {
            revert FraudRegistryV2__InvalidFeeConfig();
        }

        // Validate timing: deadline must allow for worst-case grace period
        // Grace range: [graceBlocks, 2*graceBlocks - 1]
        // Deadline range: [deadlineBlocks, 2*deadlineBlocks - 1]
        // Need: deadlineBlocks >= 2*graceBlocks
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert FraudRegistryV2__InvalidTimingConfig();
        }

        operatorRegistry = _operatorRegistry;
        feeManager = _feeManager;
        feeRecipient = _feeRecipient;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS - Fee Handling
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Validate and forward registration fee, refunding any excess
    function _collectFee(uint256 requiredFee) internal {
        if (feeManager == address(0)) return; // Free registrations

        if (msg.value < requiredFee) {
            revert FraudRegistryV2__InsufficientFee();
        }

        // Forward only the required fee to recipient
        (bool success,) = feeRecipient.call{ value: requiredFee }("");
        if (!success) {
            revert FraudRegistryV2__FeeForwardFailed();
        }

        // Refund excess to sender
        uint256 excess = msg.value - requiredFee;
        if (excess > 0) {
            (bool refundSuccess,) = msg.sender.call{ value: excess }("");
            if (!refundSuccess) {
                revert FraudRegistryV2__ExcessRefundFailed();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS - CAIP-10 Parsing (delegates to CAIP10 library)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Parse CAIP-10 string and check if registered
    /// @dev Delegates to CAIP10 library for parsing
    /// @param caip10 CAIP-10 string (e.g., "eip155:8453:0x...", "solana:mainnet:...")
    /// @return registered True if registered and not invalidated
    function _parseAndCheckRegistered(string calldata caip10) internal view returns (bool registered) {
        bytes32 key = CAIP10.toWalletStorageKey(caip10);
        WalletEntry memory entry = _wallets[key];
        return entry.registeredAtTimestamp > 0 && !entry.invalidated;
    }

    /// @notice Parse CAIP-10 string and check if pending (EVM only for now)
    /// @dev Delegates to CAIP10 library for parsing
    /// @param caip10 CAIP-10 string (e.g., "eip155:8453:0x..." or "eip155:_:0x...")
    /// @return pending True if acknowledgement is pending and not expired
    function _parseAndCheckPending(string calldata caip10) internal view returns (bool pending) {
        (bytes32 namespaceHash,, uint256 addrStart,) = CAIP10.parse(caip10);

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            address wallet = CAIP10Evm.parseEvmAddress(caip10, addrStart);
            AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
            return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
        }

        revert FraudRegistryV2__UnsupportedNamespace();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary CAIP-10 Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function isRegistered(string calldata caip10) external view returns (bool registered) {
        return _parseAndCheckRegistered(caip10);
    }

    /// @inheritdoc IFraudRegistryV2
    function isPending(string calldata caip10) external view returns (bool pending) {
        return _parseAndCheckPending(caip10);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - EVM Address Overloads (Soulbound Compatibility)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function isRegistered(address wallet) external view returns (bool registered) {
        bytes32 key = CAIP10.evmWalletKey(wallet);
        WalletEntry memory entry = _wallets[key];
        return entry.registeredAtTimestamp > 0 && !entry.invalidated;
    }

    /// @inheritdoc IFraudRegistryV2
    function isPending(address wallet) external view returns (bool pending) {
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Direct Registry Lookups
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool registered) {
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);
        TransactionEntry memory entry = _transactions[key];
        return entry.registeredAtTimestamp > 0 && !entry.invalidated;
    }

    /// @inheritdoc IFraudRegistryV2
    function isContractRegistered(address contractAddr, bytes32 chainId) external view returns (bool registered) {
        bytes32 key = CAIP10.contractStorageKey(contractAddr, chainId);
        ContractEntry memory entry = _contracts[key];
        return entry.registeredAtTimestamp > 0 && !entry.invalidated;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Extended Queries
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
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
        )
    {
        bytes32 key = CAIP10.evmWalletKey(wallet);
        WalletEntry memory entry = _wallets[key];
        registered = entry.registeredAtTimestamp > 0 && !entry.invalidated;
        return (
            registered,
            entry.namespace,
            entry.reportedChainIdHash,
            entry.incidentTimestamp,
            entry.registeredAtTimestamp,
            entry.firstBatchId
        );
    }

    /// @inheritdoc IFraudRegistryV2
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory data) {
        return _pendingAcknowledgements[wallet];
    }

    /// @inheritdoc IFraudRegistryV2
    function getBatch(uint32 batchId) external view returns (Batch memory batch) {
        return _batches[batchId];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Fee Configuration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function quoteRegistration() external view returns (uint256 fee) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).currentFeeWei();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function generateHashStruct(address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct)
    {
        deadline = TimingConfig.getSignatureDeadline();
        if (step == 1) {
            // Acknowledgement - include placeholder values for chainId and timestamp
            // Frontend will need to fill these in
            hashStruct = keccak256(
                abi.encode(
                    ACKNOWLEDGEMENT_TYPEHASH,
                    keccak256(bytes(ACK_STATEMENT)),
                    msg.sender, // wallet
                    forwarder,
                    uint64(block.chainid), // reportedChainId placeholder
                    uint64(0), // incidentTimestamp placeholder
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            // Registration
            hashStruct = keccak256(
                abi.encode(
                    REGISTRATION_TYPEHASH,
                    keccak256(bytes(REG_STATEMENT)),
                    msg.sender,
                    forwarder,
                    uint64(block.chainid),
                    uint64(0),
                    nonces[msg.sender],
                    deadline
                )
            );
        }
    }

    /// @inheritdoc IFraudRegistryV2
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
        )
    {
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;

        if (ack.expiryBlock <= block.number) {
            isExpired = true;
            timeLeft = 0;
            graceStartsAt = 0;
        } else {
            isExpired = false;
            timeLeft = ack.expiryBlock - block.number;
            graceStartsAt = ack.startBlock > block.number ? ack.startBlock - block.number : 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Individual Wallet Registration (Two-Phase)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function acknowledge(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused {
        // Validate wallet
        if (wallet == address(0)) revert FraudRegistryV2__InvalidWallet();

        // Validate deadline
        if (deadline <= block.timestamp) revert FraudRegistryV2__SignatureExpired();

        // Validate nonce
        uint256 nonce = nonces[wallet];

        // Check not already registered
        bytes32 key = CAIP10.evmWalletKey(wallet);
        if (_wallets[key].registeredAtTimestamp > 0) revert FraudRegistryV2__AlreadyRegistered();

        // Verify EIP-712 signature from WALLET (the wallet being registered signs)
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ACKNOWLEDGEMENT_TYPEHASH,
                    keccak256(bytes(ACK_STATEMENT)),
                    wallet,
                    msg.sender, // forwarder
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );

        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != wallet) revert FraudRegistryV2__InvalidSignature();

        // Increment nonce AFTER validation
        nonces[wallet]++;

        // Store acknowledgement with randomized timing
        _pendingAcknowledgements[wallet] = AcknowledgementData({
            trustedForwarder: msg.sender,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit WalletAcknowledged(wallet, msg.sender, wallet != msg.sender);
    }

    /// @inheritdoc IFraudRegistryV2
    function register(
        address wallet,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable whenNotPaused {
        // Validate wallet
        if (wallet == address(0)) revert FraudRegistryV2__InvalidWallet();

        // Validate deadline
        if (deadline <= block.timestamp) revert FraudRegistryV2__SignatureExpired();

        // Validate nonce
        uint256 nonce = nonces[wallet];

        // Load and validate acknowledgement
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        if (ack.trustedForwarder != msg.sender) revert FraudRegistryV2__InvalidForwarder();

        // Check grace period has started
        if (block.number < ack.startBlock) revert FraudRegistryV2__GracePeriodNotStarted();

        // Check not expired
        if (block.number >= ack.expiryBlock) revert FraudRegistryV2__RegistrationExpired();

        // Verify EIP-712 signature
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REGISTRATION_TYPEHASH,
                    keccak256(bytes(REG_STATEMENT)),
                    wallet,
                    msg.sender,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );

        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != wallet) revert FraudRegistryV2__InvalidSignature();

        // === EFFECTS (state changes before external calls) ===
        nonces[wallet]++;
        delete _pendingAcknowledgements[wallet];

        // Store with wildcard key
        bytes32 key = CAIP10.evmWalletKey(wallet);

        // Check if already registered (shouldn't happen, but be safe)
        if (_wallets[key].registeredAtTimestamp > 0) {
            // Silently succeed - entry already exists
            // Still collect fee below since signature was valid
        } else {
            // Compute truncated chain ID hash for storage efficiency
            uint64 chainIdHash = CAIP10Evm.truncatedEvmChainIdHash(reportedChainId);

            _wallets[key] = WalletEntry({
                namespace: Namespace.EIP155,
                reportedChainIdHash: chainIdHash,
                incidentTimestamp: incidentTimestamp,
                registeredAtTimestamp: uint64(block.timestamp),
                firstBatchId: 0, // Individual submission
                invalidated: false
            });

            // PRIVACY: Do NOT emit msg.sender - may be relayer
            bool isSponsored = wallet != msg.sender;
            emit WalletRegistered(wallet, Namespace.EIP155, chainIdHash, incidentTimestamp, isSponsored, 0);
        }

        // === INTERACTIONS (external call last) ===
        if (feeManager != address(0)) {
            _collectFee(IFeeManager(feeManager).currentFeeWei());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS - Trusted Caller Access Control
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Require caller is the authorized operator submitter contract
    modifier onlyOperatorSubmitter() {
        if (msg.sender != operatorSubmitter || operatorSubmitter == address(0)) {
            revert FraudRegistryV2__UnauthorizedOperatorSubmitter();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Trusted Caller Registration (OperatorSubmitter)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Internal helper to register a single wallet entry (reduces stack pressure)
    /// @param operator The operator address (for events)
    /// @param namespaceHash The namespace hash (e.g., NAMESPACE_EIP155)
    /// @param chainRef The chain reference hash (ignored for EVM)
    /// @param identifier The wallet identifier as bytes32
    /// @param reportedChainId The CAIP-2 chain ID hash where reported
    /// @param incidentTimestamp The incident timestamp
    /// @param batchId The batch ID this entry belongs to
    function _registerWalletEntry(
        address operator,
        bytes32 namespaceHash,
        bytes32 chainRef,
        bytes32 identifier,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint32 batchId
    ) internal {
        // Skip zero identifiers
        if (identifier == bytes32(0)) return;

        // Compute storage key and namespace enum
        Namespace ns;
        bytes32 key;

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            ns = Namespace.EIP155;
            key = CAIP10.evmWalletKey(address(uint160(uint256(identifier))));
        } else if (namespaceHash == CAIP10.NAMESPACE_SOLANA) {
            ns = Namespace.SOLANA;
            key = CAIP10.walletKey(namespaceHash, chainRef, identifier);
        } else if (namespaceHash == CAIP10.NAMESPACE_COSMOS) {
            ns = Namespace.COSMOS;
            key = CAIP10.walletKey(namespaceHash, chainRef, identifier);
        } else if (namespaceHash == CAIP10.NAMESPACE_BIP122) {
            ns = Namespace.BIP122;
            key = CAIP10.walletKey(namespaceHash, chainRef, identifier);
        } else {
            // Skip unsupported namespaces
            return;
        }

        // Compute truncated chain ID hash for storage efficiency
        uint64 chainIdHash = CAIP10.truncatedChainIdHash(reportedChainId);

        if (_wallets[key].registeredAtTimestamp > 0) {
            // Already registered - emit source event (operators are public)
            if (ns == Namespace.EIP155) {
                emit WalletOperatorSourceAdded(
                    address(uint160(uint256(identifier))), ns, chainIdHash, operator, batchId
                );
            }
            return;
        }

        _wallets[key] = WalletEntry({
            namespace: ns,
            reportedChainIdHash: chainIdHash,
            incidentTimestamp: incidentTimestamp,
            registeredAtTimestamp: uint64(block.timestamp),
            firstBatchId: batchId,
            invalidated: false
        });

        // Emit appropriate event based on namespace
        if (ns == Namespace.EIP155) {
            emit WalletRegistered(
                address(uint160(uint256(identifier))),
                ns,
                chainIdHash,
                incidentTimestamp,
                false, // Not sponsored (operator pays directly)
                batchId
            );
        }
    }

    /// @inheritdoc IFraudRegistryV2
    function registerWalletsFromOperator(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external whenNotPaused onlyOperatorSubmitter returns (uint32 batchId) {
        uint256 length = namespaceHashes.length;

        // Create batch
        batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: operator,
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: true
        });

        emit BatchCreated(batchId, operator, uint32(length), true);

        // Register each wallet
        for (uint256 i = 0; i < length; i++) {
            _registerWalletEntry(
                operator,
                namespaceHashes[i],
                chainRefs[i],
                identifiers[i],
                reportedChainIds[i],
                incidentTimestamps[i],
                batchId
            );
        }
    }

    /// @inheritdoc IFraudRegistryV2
    function registerTransactionsFromOperator(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata txHashes
    ) external whenNotPaused onlyOperatorSubmitter returns (uint32 batchId) {
        uint256 length = txHashes.length;

        batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: operator,
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: true
        });

        emit BatchCreated(batchId, operator, uint32(length), true);

        for (uint256 i = 0; i < length; i++) {
            bytes32 txHash = txHashes[i];
            if (txHash == bytes32(0)) continue;

            // Compute CAIP-2 chain ID (namespace:chainRef combined) for storage and events
            bytes32 chainId = keccak256(abi.encodePacked(namespaceHashes[i], chainRefs[i]));

            // Use txStorageKey for consistency with isTransactionRegistered lookup
            bytes32 key = CAIP10.txStorageKey(txHash, chainId);

            if (_transactions[key].registeredAtTimestamp > 0) {
                emit TransactionOperatorSourceAdded(txHash, chainId, operator, batchId);
                continue;
            }

            _transactions[key] = TransactionEntry({
                registeredAtTimestamp: uint64(block.timestamp), firstBatchId: batchId, invalidated: false
            });

            emit TransactionRegistered(txHash, chainId, false, batchId);
        }
    }

    /// @inheritdoc IFraudRegistryV2
    function registerContractsFromOperator(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata contractIds
    ) external whenNotPaused onlyOperatorSubmitter returns (uint32 batchId) {
        uint256 length = contractIds.length;

        batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: operator,
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: true
        });

        emit BatchCreated(batchId, operator, uint32(length), true);

        for (uint256 i = 0; i < length; i++) {
            bytes32 contractId = contractIds[i];
            if (contractId == bytes32(0)) continue;

            // Compute CAIP-2 chain ID (namespace:chainRef combined) for storage and events
            bytes32 chainId = keccak256(abi.encodePacked(namespaceHashes[i], chainRefs[i]));

            // For EVM contracts, extract address for indexed events and storage key
            address contractAddr = address(uint160(uint256(contractId)));

            // Use contractStorageKey for consistency with isContractRegistered lookup
            bytes32 key = CAIP10.contractStorageKey(contractAddr, chainId);

            if (_contracts[key].registeredAtTimestamp > 0) {
                emit ContractOperatorSourceAdded(contractAddr, chainId, operator, batchId);
                continue;
            }

            _contracts[key] = ContractEntry({
                registeredAtTimestamp: uint64(block.timestamp), firstBatchId: batchId, invalidated: false
            });

            emit ContractRegistered(contractAddr, chainId, operator, batchId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Cross-Chain Registration (Hub Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function registerFromSpoke(
        bytes32 namespaceHash,
        bytes32 chainRef,
        bytes32 identifier,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bytes32 sourceChainId,
        bool, // isSponsored - kept for interface compatibility, not used in event
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external whenNotPaused {
        // Only registry hub can call this
        if (msg.sender != crossChainInbox || crossChainInbox == address(0)) {
            revert FraudRegistryV2__UnauthorizedInbox();
        }

        // Determine namespace enum and compute storage key
        // EVM uses evmWalletKey (address-based wildcard key)
        // Other namespaces use chain-specific key with bytes32 identifier
        Namespace ns;
        bytes32 key;

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            ns = Namespace.EIP155;
            // Extract address from bytes32 identifier (stored in lower 160 bits)
            address wallet = address(uint160(uint256(identifier)));
            key = CAIP10.evmWalletKey(wallet);
        } else if (namespaceHash == CAIP10.NAMESPACE_SOLANA) {
            ns = Namespace.SOLANA;
            key = CAIP10.walletKey(namespaceHash, chainRef, identifier);
        } else if (namespaceHash == CAIP10.NAMESPACE_COSMOS) {
            ns = Namespace.COSMOS;
            key = CAIP10.walletKey(namespaceHash, chainRef, identifier);
        } else if (namespaceHash == CAIP10.NAMESPACE_BIP122) {
            ns = Namespace.BIP122;
            key = CAIP10.walletKey(namespaceHash, chainRef, identifier);
        } else {
            revert FraudRegistryV2__UnsupportedNamespace();
        }

        // Check if already registered - silently succeed if so
        if (_wallets[key].registeredAtTimestamp > 0) {
            return;
        }

        // Truncate reportedChainId for storage efficiency (full hash emitted in event)
        uint64 chainIdHash = CAIP10.truncatedChainIdHash(reportedChainId);

        _wallets[key] = WalletEntry({
            namespace: ns,
            reportedChainIdHash: chainIdHash,
            incidentTimestamp: incidentTimestamp,
            registeredAtTimestamp: uint64(block.timestamp),
            firstBatchId: 0, // Cross-chain individual submission
            invalidated: false
        });

        // Emit cross-chain specific event for indexers (includes full bytes32 chain info)
        emit CrossChainWalletRegistered(
            namespaceHash, identifier, sourceChainId, reportedChainId, incidentTimestamp, bridgeId, crossChainMessageId
        );
    }

    /// @inheritdoc IFraudRegistryV2
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
    ) external whenNotPaused {
        // Only cross-chain inbox can call this
        if (msg.sender != crossChainInbox || crossChainInbox == address(0)) {
            revert FraudRegistryV2__UnauthorizedInbox();
        }

        uint256 length = transactionHashes.length;

        // Create batch for the cross-chain submission
        uint32 batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: reporter,
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: false // Cross-chain individual submission, not operator
        });

        emit BatchCreated(batchId, address(0), uint32(length), false);

        // Register each transaction
        for (uint256 i = 0; i < length; i++) {
            bytes32 txHash = transactionHashes[i];
            if (txHash == bytes32(0)) continue;

            bytes32 chainId = chainIds[i];

            // Use txStorageKey for consistency with isTransactionRegistered lookup
            bytes32 key = CAIP10.txStorageKey(txHash, chainId);

            if (_transactions[key].registeredAtTimestamp > 0) {
                // Already registered - skip silently
                continue;
            }

            _transactions[key] = TransactionEntry({
                registeredAtTimestamp: uint64(block.timestamp), firstBatchId: batchId, invalidated: false
            });

            emit TransactionRegistered(txHash, chainId, isSponsored, batchId);
        }

        // Emit cross-chain batch event for indexers
        emit CrossChainTransactionBatchRegistered(
            reporter, dataHash, sourceChainId, reportedChainId, uint32(length), bridgeId, crossChainMessageId
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - DAO Controls
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner {
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    /// @inheritdoc IFraudRegistryV2
    function setOperatorSubmitter(address _operatorSubmitter) external onlyOwner {
        operatorSubmitter = _operatorSubmitter;
        emit OperatorSubmitterSet(_operatorSubmitter);
    }

    /// @inheritdoc IFraudRegistryV2
    function setCrossChainInbox(address _crossChainInbox) external onlyOwner {
        crossChainInbox = _crossChainInbox;
        emit CrossChainInboxSet(_crossChainInbox);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAUSABLE (Emergency)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Pause the contract (emergency only)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}

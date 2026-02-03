// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { IFraudRegistryV2 } from "./interfaces/IFraudRegistryV2.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { RegistryCapabilities } from "../libraries/RegistryCapabilities.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";

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

    /// @dev Capability bits for operator registry checks
    uint8 private constant WALLET_CAPABILITY = RegistryCapabilities.WALLET_REGISTRY;
    uint8 private constant TX_CAPABILITY = RegistryCapabilities.TX_REGISTRY;
    uint8 private constant CONTRACT_CAPABILITY = RegistryCapabilities.CONTRACT_REGISTRY;

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

    /// @notice Wallet entries: wildcard key => WalletEntry
    /// @dev Key = CAIP10.evmWalletKey(wallet) = keccak256(abi.encodePacked("eip155:_:", wallet))
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

    /// @notice Operator registry address
    address public operatorRegistry;

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

    /// @dev Validate and forward registration fee
    function _collectFee(uint256 requiredFee) internal {
        if (feeManager == address(0)) return; // Free registrations

        if (msg.value < requiredFee) {
            revert FraudRegistryV2__InsufficientFee();
        }

        // Forward fee to recipient
        (bool success,) = feeRecipient.call{ value: msg.value }("");
        if (!success) {
            revert FraudRegistryV2__FeeForwardFailed();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS - CAIP-10 Parsing (delegates to CAIP10 library)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Parse CAIP-10 string and check if registered
    /// @param caip10 CAIP-10 string (e.g., "eip155:8453:0x...", "solana:mainnet:...")
    /// @return registered True if registered and not invalidated
    function _parseAndCheckRegistered(string calldata caip10) internal view returns (bool registered) {
        bytes32 key = CAIP10.toWalletStorageKey(caip10);
        WalletEntry memory entry = _wallets[key];
        return entry.registeredAtTimestamp > 0 && !entry.invalidated;
    }

    /// @dev Parse CAIP-10 string and check if pending (EVM only for now)
    /// @param caip10 CAIP-10 string (e.g., "eip155:8453:0x..." or "eip155:_:0x...")
    /// @return pending True if acknowledgement is pending and not expired
    function _parseAndCheckPending(string calldata caip10) internal view returns (bool pending) {
        (bytes32 namespaceHash,, uint256 addrStart,) = CAIP10.parse(caip10);

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            address wallet = CAIP10.parseEvmAddress(caip10, addrStart);
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

    /// @inheritdoc IFraudRegistryV2
    function quoteOperatorBatchRegistration() external view returns (uint256 fee) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).operatorBatchFeeWei();
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
    function acknowledgeEvmWallet(
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
    function registerEvmWallet(
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

        // Collect fee (if configured)
        if (feeManager != address(0)) {
            _collectFee(IFeeManager(feeManager).currentFeeWei());
        }

        // State changes
        nonces[wallet]++;
        delete _pendingAcknowledgements[wallet];

        // Store with wildcard key
        bytes32 key = CAIP10.evmWalletKey(wallet);

        // Check if already registered (shouldn't happen, but be safe)
        if (_wallets[key].registeredAtTimestamp > 0) {
            // Silently succeed - entry already exists
            return;
        }

        // Compute truncated chain ID hash for storage efficiency
        uint64 chainIdHash = CAIP10.truncatedEvmChainIdHash(reportedChainId);

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

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Operator Batch Registration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Check if caller is approved operator with given capability
    function _requireApprovedOperator(uint8 capability) internal view {
        if (
            operatorRegistry == address(0) || !IOperatorRegistry(operatorRegistry).isApprovedFor(msg.sender, capability)
        ) {
            revert FraudRegistryV2__NotApprovedOperator();
        }
    }

    /// @inheritdoc IFraudRegistryV2
    function registerEvmWalletsAsOperator(
        address[] calldata walletAddresses,
        uint64[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external payable whenNotPaused {
        _requireApprovedOperator(WALLET_CAPABILITY);

        // Validate arrays
        uint256 length = walletAddresses.length;
        if (length == 0) revert FraudRegistryV2__EmptyBatch();
        if (length != reportedChainIds.length || length != incidentTimestamps.length) {
            revert FraudRegistryV2__ArrayLengthMismatch();
        }

        // Collect fee (if configured)
        if (feeManager != address(0)) {
            _collectFee(IFeeManager(feeManager).operatorBatchFeeWei());
        }

        // Create batch
        uint32 batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: msg.sender, // Operators are public
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: true
        });

        emit BatchCreated(batchId, msg.sender, uint32(length), true);

        // Register each wallet
        for (uint256 i = 0; i < length; i++) {
            address wallet = walletAddresses[i];
            if (wallet == address(0)) continue; // Skip invalid

            bytes32 key = CAIP10.evmWalletKey(wallet);

            // Compute truncated chain ID hash for storage efficiency
            uint64 chainIdHash = CAIP10.truncatedEvmChainIdHash(reportedChainIds[i]);

            if (_wallets[key].registeredAtTimestamp > 0) {
                // Already registered - emit source event (operators are public)
                emit WalletOperatorSourceAdded(wallet, Namespace.EIP155, chainIdHash, msg.sender, batchId);
                continue;
            }

            _wallets[key] = WalletEntry({
                namespace: Namespace.EIP155,
                reportedChainIdHash: chainIdHash,
                incidentTimestamp: incidentTimestamps[i],
                registeredAtTimestamp: uint64(block.timestamp),
                firstBatchId: batchId,
                invalidated: false
            });

            emit WalletRegistered(
                wallet,
                Namespace.EIP155,
                chainIdHash,
                incidentTimestamps[i],
                false, // Not sponsored (operator pays directly)
                batchId
            );
        }
    }

    /// @inheritdoc IFraudRegistryV2
    function registerTransactionsAsOperator(bytes32[] calldata txHashes, bytes32[] calldata chainIds)
        external
        payable
        whenNotPaused
    {
        _requireApprovedOperator(TX_CAPABILITY);

        uint256 length = txHashes.length;
        if (length == 0) revert FraudRegistryV2__EmptyBatch();
        if (length != chainIds.length) revert FraudRegistryV2__ArrayLengthMismatch();

        // Collect fee (if configured)
        if (feeManager != address(0)) {
            _collectFee(IFeeManager(feeManager).operatorBatchFeeWei());
        }

        uint32 batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: msg.sender,
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: true
        });

        emit BatchCreated(batchId, msg.sender, uint32(length), true);

        for (uint256 i = 0; i < length; i++) {
            bytes32 key = CAIP10.txStorageKey(txHashes[i], chainIds[i]);

            if (_transactions[key].registeredAtTimestamp > 0) {
                emit TransactionOperatorSourceAdded(txHashes[i], chainIds[i], msg.sender, batchId);
                continue;
            }

            _transactions[key] = TransactionEntry({
                registeredAtTimestamp: uint64(block.timestamp), firstBatchId: batchId, invalidated: false
            });

            emit TransactionRegistered(txHashes[i], chainIds[i], false, batchId);
        }
    }

    /// @inheritdoc IFraudRegistryV2
    function registerContractsAsOperator(address[] calldata contractAddresses, bytes32[] calldata chainIds)
        external
        payable
        whenNotPaused
    {
        _requireApprovedOperator(CONTRACT_CAPABILITY);

        uint256 length = contractAddresses.length;
        if (length == 0) revert FraudRegistryV2__EmptyBatch();
        if (length != chainIds.length) revert FraudRegistryV2__ArrayLengthMismatch();

        // Collect fee (if configured)
        if (feeManager != address(0)) {
            _collectFee(IFeeManager(feeManager).operatorBatchFeeWei());
        }

        uint32 batchId = nextBatchId++;
        _batches[batchId] = Batch({
            submitter: msg.sender,
            createdAtTimestamp: uint64(block.timestamp),
            entryCount: uint32(length),
            isOperator: true
        });

        emit BatchCreated(batchId, msg.sender, uint32(length), true);

        for (uint256 i = 0; i < length; i++) {
            address contractAddr = contractAddresses[i];
            if (contractAddr == address(0)) continue;

            bytes32 key = CAIP10.contractStorageKey(contractAddr, chainIds[i]);

            if (_contracts[key].registeredAtTimestamp > 0) {
                emit ContractOperatorSourceAdded(contractAddr, chainIds[i], msg.sender, batchId);
                continue;
            }

            _contracts[key] = ContractEntry({
                registeredAtTimestamp: uint64(block.timestamp), firstBatchId: batchId, invalidated: false
            });

            emit ContractRegistered(contractAddr, chainIds[i], msg.sender, batchId);
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

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - DAO Controls
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner {
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    /// @inheritdoc IFraudRegistryV2
    function setCrossChainInbox(address _crossChainInbox) external onlyOwner {
        crossChainInbox = _crossChainInbox;
        emit CrossChainInboxSet(_crossChainInbox);
    }

    /// @inheritdoc IFraudRegistryV2
    function invalidateEvmWallet(address wallet, string calldata reason) external onlyOwner {
        bytes32 key = CAIP10.evmWalletKey(wallet);
        WalletEntry storage entry = _wallets[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (entry.invalidated) revert FraudRegistryV2__AlreadyInvalidated();

        entry.invalidated = true;
        emit EntryInvalidated(key, "wallet", msg.sender, reason);
    }

    /// @inheritdoc IFraudRegistryV2
    function reinstateEvmWallet(address wallet) external onlyOwner {
        bytes32 key = CAIP10.evmWalletKey(wallet);
        WalletEntry storage entry = _wallets[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (!entry.invalidated) revert FraudRegistryV2__NotInvalidated();

        entry.invalidated = false;
        emit EntryReinstated(key, "wallet", msg.sender);
    }

    /// @inheritdoc IFraudRegistryV2
    function invalidateTransaction(bytes32 txHash, bytes32 chainId, string calldata reason) external onlyOwner {
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);
        TransactionEntry storage entry = _transactions[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (entry.invalidated) revert FraudRegistryV2__AlreadyInvalidated();

        entry.invalidated = true;
        emit EntryInvalidated(key, "transaction", msg.sender, reason);
    }

    /// @inheritdoc IFraudRegistryV2
    function reinstateTransaction(bytes32 txHash, bytes32 chainId) external onlyOwner {
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);
        TransactionEntry storage entry = _transactions[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (!entry.invalidated) revert FraudRegistryV2__NotInvalidated();

        entry.invalidated = false;
        emit EntryReinstated(key, "transaction", msg.sender);
    }

    /// @inheritdoc IFraudRegistryV2
    function invalidateContract(address contractAddr, bytes32 chainId, string calldata reason) external onlyOwner {
        bytes32 key = CAIP10.contractStorageKey(contractAddr, chainId);
        ContractEntry storage entry = _contracts[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (entry.invalidated) revert FraudRegistryV2__AlreadyInvalidated();

        entry.invalidated = true;
        emit EntryInvalidated(key, "contract", msg.sender, reason);
    }

    /// @inheritdoc IFraudRegistryV2
    function reinstateContract(address contractAddr, bytes32 chainId) external onlyOwner {
        bytes32 key = CAIP10.contractStorageKey(contractAddr, chainId);
        ContractEntry storage entry = _contracts[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (!entry.invalidated) revert FraudRegistryV2__NotInvalidated();

        entry.invalidated = false;
        emit EntryReinstated(key, "contract", msg.sender);
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

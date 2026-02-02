// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { IFraudRegistryV2 } from "./interfaces/IFraudRegistryV2.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { RegistryCapabilities } from "../libraries/RegistryCapabilities.sol";

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
    using Strings for uint256;
    using Strings for address;

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

    /// @notice Where fees are forwarded (RegistryHub or treasury)
    address public immutable feeRecipient;

    // ═══════════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet entries: wildcard key => WalletEntry
    /// @dev Key = keccak256(abi.encodePacked("eip155:_:", wallet))
    mapping(bytes32 => WalletEntry) private _wallets;

    /// @notice Transaction entries: key => TransactionEntry
    /// @dev Key = keccak256(abi.encode(txHash, chainId))
    mapping(bytes32 => TransactionEntry) private _transactions;

    /// @notice Contract entries: key => ContractEntry
    /// @dev Key = keccak256(abi.encode(contractAddr, chainId))
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

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the V2 registry
    /// @param _owner Initial owner (DAO multisig)
    /// @param _operatorRegistry Operator registry address
    /// @param _feeManager FeeManager contract address (address(0) for free registrations)
    /// @param _feeRecipient Where fees go (RegistryHub or treasury)
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
    // INTERNAL HELPERS - Storage Keys
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Compute wildcard storage key for EVM EOA wallet
    /// @param wallet The wallet address
    /// @return key The storage key using CAIP-363-inspired wildcard
    function _evmWalletKey(address wallet) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("eip155:_:", wallet));
    }

    /// @dev Compute storage key for transaction
    function _txKey(bytes32 txHash, bytes32 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(txHash, chainId));
    }

    /// @dev Compute storage key for contract
    function _contractKey(address contractAddr, bytes32 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encode(contractAddr, chainId));
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
    // INTERNAL HELPERS - CAIP-10 Parsing
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Parse CAIP-10 string and check if registered
    /// @param caip10 CAIP-10 string (e.g., "eip155:8453:0x..." or "eip155:_:0x...")
    /// @return registered True if registered and not invalidated
    function _parseAndCheckRegistered(string calldata caip10) internal view returns (bool registered) {
        // Parse namespace (everything before first ':')
        bytes memory caip10Bytes = bytes(caip10);
        uint256 len = caip10Bytes.length;

        // Find first colon (namespace separator)
        uint256 firstColon = 0;
        for (uint256 i = 0; i < len; i++) {
            if (caip10Bytes[i] == ":") {
                firstColon = i;
                break;
            }
        }
        if (firstColon == 0) revert FraudRegistryV2__InvalidCaip10Format();

        // Extract namespace
        bytes memory namespaceBytes = new bytes(firstColon);
        for (uint256 i = 0; i < firstColon; i++) {
            namespaceBytes[i] = caip10Bytes[i];
        }

        // Check namespace
        if (keccak256(namespaceBytes) == keccak256("eip155")) {
            // EVM namespace - find second colon (chainId separator)
            uint256 secondColon = 0;
            for (uint256 i = firstColon + 1; i < len; i++) {
                if (caip10Bytes[i] == ":") {
                    secondColon = i;
                    break;
                }
            }
            if (secondColon == 0) revert FraudRegistryV2__InvalidCaip10Format();

            // Extract address (everything after second colon)
            // Address should be 42 chars (0x + 40 hex)
            uint256 addrLen = len - secondColon - 1;
            if (addrLen != 42) revert FraudRegistryV2__InvalidCaip10Format();

            // Parse hex address
            address wallet = _parseHexAddress(caip10Bytes, secondColon + 1);

            // For EVM, always use wildcard key (chainId in CAIP-10 is ignored for lookup)
            // This is by design - EVM EOAs have the same address on all chains
            bytes32 key = _evmWalletKey(wallet);
            WalletEntry memory entry = _wallets[key];
            return entry.registeredAtTimestamp > 0 && !entry.invalidated;
        } else {
            // Unsupported namespace
            revert FraudRegistryV2__UnsupportedNamespace();
        }
    }

    /// @dev Parse hex address from bytes at given offset
    function _parseHexAddress(bytes memory data, uint256 offset) internal pure returns (address) {
        // Verify 0x prefix
        if (data[offset] != "0" || (data[offset + 1] != "x" && data[offset + 1] != "X")) {
            revert FraudRegistryV2__InvalidCaip10Format();
        }

        uint160 addr = 0;
        for (uint256 i = 0; i < 40; i++) {
            uint8 b = uint8(data[offset + 2 + i]);
            uint8 val;
            if (b >= 48 && b <= 57) {
                val = b - 48; // 0-9
            } else if (b >= 65 && b <= 70) {
                val = b - 55; // A-F
            } else if (b >= 97 && b <= 102) {
                val = b - 87; // a-f
            } else {
                revert FraudRegistryV2__InvalidCaip10Format();
            }
            addr = addr * 16 + val;
        }
        return address(addr);
    }

    /// @dev Parse CAIP-10 string and check if pending
    function _parseAndCheckPending(string calldata caip10) internal view returns (bool pending) {
        // Parse namespace (everything before first ':')
        bytes memory caip10Bytes = bytes(caip10);
        uint256 len = caip10Bytes.length;

        // Find first colon
        uint256 firstColon = 0;
        for (uint256 i = 0; i < len; i++) {
            if (caip10Bytes[i] == ":") {
                firstColon = i;
                break;
            }
        }
        if (firstColon == 0) revert FraudRegistryV2__InvalidCaip10Format();

        // Extract namespace
        bytes memory namespaceBytes = new bytes(firstColon);
        for (uint256 i = 0; i < firstColon; i++) {
            namespaceBytes[i] = caip10Bytes[i];
        }

        // Check namespace
        if (keccak256(namespaceBytes) == keccak256("eip155")) {
            // EVM namespace - find second colon
            uint256 secondColon = 0;
            for (uint256 i = firstColon + 1; i < len; i++) {
                if (caip10Bytes[i] == ":") {
                    secondColon = i;
                    break;
                }
            }
            if (secondColon == 0) revert FraudRegistryV2__InvalidCaip10Format();

            // Parse address
            uint256 addrLen = len - secondColon - 1;
            if (addrLen != 42) revert FraudRegistryV2__InvalidCaip10Format();

            address wallet = _parseHexAddress(caip10Bytes, secondColon + 1);

            AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
            return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
        } else {
            revert FraudRegistryV2__UnsupportedNamespace();
        }
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
        bytes32 key = _evmWalletKey(wallet);
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
        bytes32 key = _txKey(txHash, chainId);
        TransactionEntry memory entry = _transactions[key];
        return entry.registeredAtTimestamp > 0 && !entry.invalidated;
    }

    /// @inheritdoc IFraudRegistryV2
    function isContractRegistered(address contractAddr, bytes32 chainId) external view returns (bool registered) {
        bytes32 key = _contractKey(contractAddr, chainId);
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
            uint64 reportedChainId,
            uint64 incidentTimestamp,
            uint64 registeredAtTimestamp,
            uint32 batchId
        )
    {
        bytes32 key = _evmWalletKey(wallet);
        WalletEntry memory entry = _wallets[key];
        registered = entry.registeredAtTimestamp > 0 && !entry.invalidated;
        return (
            registered,
            entry.namespace,
            entry.reportedChainId,
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
        bytes32 key = _evmWalletKey(wallet);
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
        bytes32 key = _evmWalletKey(wallet);

        // Check if already registered (shouldn't happen, but be safe)
        if (_wallets[key].registeredAtTimestamp > 0) {
            // Silently succeed - entry already exists
            return;
        }

        _wallets[key] = WalletEntry({
            namespace: Namespace.EIP155,
            reportedChainId: reportedChainId,
            incidentTimestamp: incidentTimestamp,
            registeredAtTimestamp: uint64(block.timestamp),
            firstBatchId: 0, // Individual submission
            invalidated: false
        });

        // PRIVACY: Do NOT emit msg.sender - may be relayer
        bool isSponsored = wallet != msg.sender;
        emit WalletRegistered(wallet, Namespace.EIP155, reportedChainId, incidentTimestamp, isSponsored, 0);
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

            bytes32 key = _evmWalletKey(wallet);

            if (_wallets[key].registeredAtTimestamp > 0) {
                // Already registered - emit source event (operators are public)
                emit WalletOperatorSourceAdded(wallet, Namespace.EIP155, reportedChainIds[i], msg.sender, batchId);
                continue;
            }

            _wallets[key] = WalletEntry({
                namespace: Namespace.EIP155,
                reportedChainId: reportedChainIds[i],
                incidentTimestamp: incidentTimestamps[i],
                registeredAtTimestamp: uint64(block.timestamp),
                firstBatchId: batchId,
                invalidated: false
            });

            emit WalletRegistered(
                wallet,
                Namespace.EIP155,
                reportedChainIds[i],
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
            bytes32 key = _txKey(txHashes[i], chainIds[i]);

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

            bytes32 key = _contractKey(contractAddr, chainIds[i]);

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
    // WRITE FUNCTIONS - DAO Controls
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryV2
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner {
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    /// @inheritdoc IFraudRegistryV2
    function invalidateEvmWallet(address wallet, string calldata reason) external onlyOwner {
        bytes32 key = _evmWalletKey(wallet);
        WalletEntry storage entry = _wallets[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (entry.invalidated) revert FraudRegistryV2__AlreadyInvalidated();

        entry.invalidated = true;
        emit EntryInvalidated(key, "wallet", msg.sender, reason);
    }

    /// @inheritdoc IFraudRegistryV2
    function reinstateEvmWallet(address wallet) external onlyOwner {
        bytes32 key = _evmWalletKey(wallet);
        WalletEntry storage entry = _wallets[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (!entry.invalidated) revert FraudRegistryV2__NotInvalidated();

        entry.invalidated = false;
        emit EntryReinstated(key, "wallet", msg.sender);
    }

    /// @inheritdoc IFraudRegistryV2
    function invalidateTransaction(bytes32 txHash, bytes32 chainId, string calldata reason) external onlyOwner {
        bytes32 key = _txKey(txHash, chainId);
        TransactionEntry storage entry = _transactions[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (entry.invalidated) revert FraudRegistryV2__AlreadyInvalidated();

        entry.invalidated = true;
        emit EntryInvalidated(key, "transaction", msg.sender, reason);
    }

    /// @inheritdoc IFraudRegistryV2
    function reinstateTransaction(bytes32 txHash, bytes32 chainId) external onlyOwner {
        bytes32 key = _txKey(txHash, chainId);
        TransactionEntry storage entry = _transactions[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (!entry.invalidated) revert FraudRegistryV2__NotInvalidated();

        entry.invalidated = false;
        emit EntryReinstated(key, "transaction", msg.sender);
    }

    /// @inheritdoc IFraudRegistryV2
    function invalidateContract(address contractAddr, bytes32 chainId, string calldata reason) external onlyOwner {
        bytes32 key = _contractKey(contractAddr, chainId);
        ContractEntry storage entry = _contracts[key];

        if (entry.registeredAtTimestamp == 0) revert FraudRegistryV2__EntryNotFound();
        if (entry.invalidated) revert FraudRegistryV2__AlreadyInvalidated();

        entry.invalidated = true;
        emit EntryInvalidated(key, "contract", msg.sender, reason);
    }

    /// @inheritdoc IFraudRegistryV2
    function reinstateContract(address contractAddr, bytes32 chainId) external onlyOwner {
        bytes32 key = _contractKey(contractAddr, chainId);
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

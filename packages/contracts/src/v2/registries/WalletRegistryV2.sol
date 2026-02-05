// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { IWalletRegistryV2 } from "../interfaces/IWalletRegistryV2.sol";
import { IFeeManager } from "../../interfaces/IFeeManager.sol";
import { TimingConfig } from "../../libraries/TimingConfig.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { CAIP10Evm } from "../libraries/CAIP10Evm.sol";
import { EIP712ConstantsV2 } from "../libraries/EIP712ConstantsV2.sol";

/// @title WalletRegistryV2
/// @author Stolen Wallet Registry Team
/// @notice Stolen wallet registry with two-phase registration (anti-phishing)
/// @dev Extracted from FraudRegistryV2 for contract size optimization.
///      Key features:
///      - CAIP-10 string interface with typed EVM overloads
///      - CAIP-363 wildcard keys for EVM wallets
///      - Two-phase registration (acknowledge → grace period → register)
///      - Single-phase for operator/cross-chain submissions
contract WalletRegistryV2 is IWalletRegistryV2, EIP712, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Base blocks for grace period
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for deadline window
    uint256 public immutable deadlineBlocks;

    /// @notice Fee manager address (address(0) = free registrations)
    address public immutable feeManager;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet entries: storage key => WalletEntry
    mapping(bytes32 => WalletEntry) private _wallets;

    /// @notice Batch metadata
    mapping(uint256 => Batch) private _batches;

    /// @notice Next batch ID
    uint256 private _nextBatchId = 1;

    /// @notice Pending acknowledgements for two-phase registration
    mapping(address => AcknowledgementData) private _pendingAcknowledgements;

    /// @notice Nonces for replay protection (keyed to signer address)
    mapping(address => uint256) public nonces;

    /// @notice Hub address for cross-chain registrations
    address public hub;

    /// @notice Operator submitter contract address
    address public operatorSubmitter;

    // NOTE: registrationFee variable removed — fee is dynamic via FeeManager.
    // Use quoteRegistration(address) to get the current fee.

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the wallet registry
    /// @param _owner Initial owner
    /// @param _feeManager FeeManager contract (address(0) for free registrations)
    /// @param _graceBlocks Base blocks for grace period
    /// @param _deadlineBlocks Base blocks for deadline window
    constructor(address _owner, address _feeManager, uint256 _graceBlocks, uint256 _deadlineBlocks)
        EIP712("StolenWalletRegistry", "4")
        Ownable(_owner)
    {
        if (_owner == address(0)) revert WalletRegistryV2__ZeroAddress();

        // Validate timing: deadline must allow for worst-case grace period
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert WalletRegistryV2__DeadlineInPast();
        }

        feeManager = _feeManager;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyHub() {
        if (msg.sender != hub || hub == address(0)) {
            revert WalletRegistryV2__OnlyHub();
        }
        _;
    }

    modifier onlyOperatorSubmitter() {
        if (msg.sender != operatorSubmitter || operatorSubmitter == address(0)) {
            revert WalletRegistryV2__OnlyOperatorSubmitter();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS - Fee Handling
    // ═══════════════════════════════════════════════════════════════════════════

    function _collectFee() internal {
        if (feeManager == address(0)) return;

        uint256 requiredFee = IFeeManager(feeManager).currentFeeWei();
        if (msg.value < requiredFee) {
            revert WalletRegistryV2__InsufficientFee();
        }

        // Forward to hub (which collects all fees)
        if (hub != address(0)) {
            (bool success,) = hub.call{ value: requiredFee }("");
            if (!success) {
                revert WalletRegistryV2__InsufficientFee();
            }
        }

        // Refund excess
        uint256 excess = msg.value - requiredFee;
        if (excess > 0) {
            (bool refundSuccess,) = msg.sender.call{ value: excess }("");
            if (!refundSuccess) {
                revert WalletRegistryV2__InsufficientFee();
            }
        }
    }

    /// @dev Internal helper to verify acknowledgement signature (reduces stack depth)
    function _verifyAckSignature(
        address registeree,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_ACK_TYPEHASH,
                    EIP712ConstantsV2.ACK_STATEMENT_HASH,
                    registeree,
                    forwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );

        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != registeree) {
            revert WalletRegistryV2__InvalidSignature();
        }
    }

    /// @dev Internal helper to verify registration signature (reduces stack depth)
    function _verifyRegSignature(
        address registeree,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_REG_TYPEHASH,
                    EIP712ConstantsV2.REG_STATEMENT_HASH,
                    registeree,
                    forwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline
                )
            )
        );

        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != registeree) {
            revert WalletRegistryV2__InvalidSignature();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - CAIP-10 String Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function isWalletRegistered(string calldata caip10) external view returns (bool) {
        bytes32 key = CAIP10.toWalletStorageKey(caip10);
        WalletEntry memory entry = _wallets[key];
        return entry.registeredAt > 0;
    }

    /// @inheritdoc IWalletRegistryV2
    function getWalletEntry(string calldata caip10) external view returns (WalletEntry memory) {
        bytes32 key = CAIP10.toWalletStorageKey(caip10);
        return _wallets[key];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Typed EVM Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function isWalletRegistered(address wallet) external view returns (bool) {
        bytes32 key = CAIP10Evm.evmWalletKey(wallet);
        WalletEntry memory entry = _wallets[key];
        return entry.registeredAt > 0;
    }

    /// @inheritdoc IWalletRegistryV2
    function getWalletEntry(address wallet) external view returns (WalletEntry memory) {
        bytes32 key = CAIP10Evm.evmWalletKey(wallet);
        return _wallets[key];
    }

    /// @inheritdoc IWalletRegistryV2
    function isWalletPending(address wallet) external view returns (bool) {
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        return ack.forwarder != address(0) && block.number < ack.deadline;
    }

    /// @inheritdoc IWalletRegistryV2
    function getAcknowledgementData(address wallet) external view returns (AcknowledgementData memory) {
        return _pendingAcknowledgements[wallet];
    }

    /// @inheritdoc IWalletRegistryV2
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
        )
    {
        AcknowledgementData memory ack = _pendingAcknowledgements[registeree];
        currentBlock = block.number;
        expiryBlock = ack.deadline;
        startBlock = ack.gracePeriodStart;

        if (ack.deadline <= block.number) {
            isExpired = true;
            timeLeft = 0;
            graceStartsAt = 0;
        } else {
            isExpired = false;
            timeLeft = ack.deadline - block.number;
            graceStartsAt = ack.gracePeriodStart > block.number ? ack.gracePeriodStart - block.number : 0;
        }
    }

    /// @inheritdoc IWalletRegistryV2
    function generateHashStruct(uint64 reportedChainId, uint64 incidentTimestamp, address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct)
    {
        deadline = TimingConfig.getSignatureDeadline();
        if (step == 1) {
            // Acknowledgement
            hashStruct = keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_ACK_TYPEHASH,
                    EIP712ConstantsV2.ACK_STATEMENT_HASH,
                    msg.sender, // wallet
                    forwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            // Registration
            hashStruct = keccak256(
                abi.encode(
                    EIP712ConstantsV2.WALLET_REG_TYPEHASH,
                    EIP712ConstantsV2.REG_STATEMENT_HASH,
                    msg.sender,
                    forwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonces[msg.sender],
                    deadline
                )
            );
        }
    }

    /// @inheritdoc IWalletRegistryV2
    function getBatch(uint256 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }

    /// @inheritdoc IWalletRegistryV2
    function batchCount() external view returns (uint256) {
        return _nextBatchId - 1;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE QUOTING (Unified interface matching SpokeRegistryV2)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function quoteRegistration(
        address /* owner */
    )
        external
        view
        returns (uint256)
    {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).currentFeeWei();
    }

    /// @inheritdoc IWalletRegistryV2
    function quoteFeeBreakdown(
        address /* owner */
    )
        external
        view
        returns (FeeBreakdown memory breakdown)
    {
        uint256 fee = feeManager == address(0) ? 0 : IFeeManager(feeManager).currentFeeWei();
        breakdown = FeeBreakdown({ bridgeFee: 0, registrationFee: fee, total: fee, bridgeName: "" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TWO-PHASE REGISTRATION - Phase 1: Acknowledgement
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function acknowledge(
        address registeree,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        if (registeree == address(0)) revert WalletRegistryV2__ZeroAddress();
        if (deadline <= block.timestamp) revert WalletRegistryV2__DeadlineExpired();

        // Check not already registered
        bytes32 key = CAIP10Evm.evmWalletKey(registeree);
        if (_wallets[key].registeredAt > 0) revert WalletRegistryV2__AlreadyRegistered();

        // Check not already acknowledged
        AcknowledgementData memory existing = _pendingAcknowledgements[registeree];
        if (existing.forwarder != address(0) && block.number < existing.deadline) {
            revert WalletRegistryV2__AlreadyAcknowledged();
        }

        uint256 nonce = nonces[registeree];

        // Verify EIP-712 signature from registeree (includes reportedChainId + incidentTimestamp)
        _verifyAckSignature(registeree, forwarder, reportedChainId, incidentTimestamp, nonce, deadline, v, r, s);

        // Increment nonce after validation
        nonces[registeree]++;

        // Derive isSponsored: if forwarder != registeree, someone else is paying
        bool isSponsored = registeree != forwarder;

        // Convert uint64 reportedChainId to bytes32 CAIP-2 hash for storage
        bytes32 reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);

        // Store acknowledgement with randomized timing
        _pendingAcknowledgements[registeree] = AcknowledgementData({
            deadline: TimingConfig.getDeadlineBlock(deadlineBlocks),
            nonce: nonce,
            gracePeriodStart: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            reportedChainId: reportedChainIdHash,
            forwarder: forwarder,
            incidentTimestamp: incidentTimestamp,
            isSponsored: isSponsored
        });

        emit WalletAcknowledged(registeree, forwarder, isSponsored);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TWO-PHASE REGISTRATION - Phase 2: Registration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function register(
        address registeree,
        uint256 deadline,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        if (registeree == address(0)) revert WalletRegistryV2__ZeroAddress();
        if (deadline <= block.timestamp) revert WalletRegistryV2__DeadlineExpired();

        // Load and validate acknowledgement
        AcknowledgementData memory ack = _pendingAcknowledgements[registeree];
        if (ack.forwarder != msg.sender) revert WalletRegistryV2__NotAuthorizedForwarder();
        if (block.number < ack.gracePeriodStart) revert WalletRegistryV2__GracePeriodNotStarted();
        if (block.number >= ack.deadline) revert WalletRegistryV2__DeadlineExpired();

        // Validate reportedChainId and incidentTimestamp match acknowledge phase
        bytes32 reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);
        if (ack.reportedChainId != reportedChainIdHash || ack.incidentTimestamp != incidentTimestamp) {
            revert WalletRegistryV2__InvalidSignature();
        }

        uint256 nonce = nonces[registeree];

        // Verify EIP-712 signature (uses real reportedChainId + incidentTimestamp)
        _verifyRegSignature(registeree, msg.sender, reportedChainId, incidentTimestamp, nonce, deadline, v, r, s);

        // === EFFECTS ===
        nonces[registeree]++;
        delete _pendingAcknowledgements[registeree];

        // Store wallet entry
        bytes32 key = CAIP10Evm.evmWalletKey(registeree);

        if (_wallets[key].registeredAt == 0) {
            _wallets[key] = WalletEntry({
                reportedChainId: reportedChainIdHash,
                sourceChainId: CAIP10Evm.caip2Hash(uint64(block.chainid)),
                messageId: bytes32(0),
                registeredAt: uint64(block.timestamp),
                incidentTimestamp: incidentTimestamp,
                bridgeId: 0,
                isSponsored: ack.isSponsored
            });

            emit WalletRegistered(
                bytes32(uint256(uint160(registeree))), reportedChainIdHash, incidentTimestamp, ack.isSponsored
            );
        }

        // === INTERACTIONS ===
        _collectFee();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION (Hub Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
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
    ) external onlyHub {
        // Compute storage key based on namespace
        bytes32 key;

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            // EVM wallets use wildcard key (chainRefHash ignored)
            address wallet = address(uint160(uint256(identifier)));
            key = CAIP10Evm.evmWalletKey(wallet);
        } else {
            // Non-EVM: chainRefHash is already pre-computed by spoke
            key = CAIP10.walletKey(namespaceHash, chainRefHash, identifier);
        }

        // Silently succeed if already registered
        if (_wallets[key].registeredAt > 0) {
            return;
        }

        _wallets[key] = WalletEntry({
            reportedChainId: reportedChainId,
            sourceChainId: sourceChainId,
            messageId: messageId,
            registeredAt: uint64(block.timestamp),
            incidentTimestamp: incidentTimestamp,
            bridgeId: bridgeId,
            isSponsored: isSponsored
        });

        emit WalletRegistered(identifier, reportedChainId, incidentTimestamp, isSponsored);
        emit CrossChainWalletRegistered(identifier, sourceChainId, bridgeId, messageId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function registerWalletsFromOperator(
        bytes32 operatorId,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external onlyOperatorSubmitter returns (uint256 batchId) {
        uint256 length = identifiers.length;

        if (length == 0) revert WalletRegistryV2__EmptyBatch();
        if (length != reportedChainIds.length || length != incidentTimestamps.length) {
            revert WalletRegistryV2__ArrayLengthMismatch();
        }

        // Create batch
        batchId = _nextBatchId++;
        _batches[batchId] =
            Batch({ operatorId: operatorId, timestamp: uint64(block.timestamp), walletCount: uint32(length) });

        emit BatchCreated(batchId, operatorId, uint32(length));

        // Register each wallet
        bytes32 localSourceChainId = CAIP10Evm.caip2Hash(uint64(block.chainid));

        for (uint256 i = 0; i < length; i++) {
            bytes32 identifier = identifiers[i];
            if (identifier == bytes32(0)) continue;

            // Assume EVM addresses for operator submissions
            address wallet = address(uint160(uint256(identifier)));
            bytes32 key = CAIP10Evm.evmWalletKey(wallet);

            if (_wallets[key].registeredAt > 0) continue;

            _wallets[key] = WalletEntry({
                reportedChainId: reportedChainIds[i],
                sourceChainId: localSourceChainId,
                messageId: bytes32(0),
                registeredAt: uint64(block.timestamp),
                incidentTimestamp: incidentTimestamps[i],
                bridgeId: 0,
                isSponsored: false
            });

            emit WalletRegistered(identifier, reportedChainIds[i], incidentTimestamps[i], false);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IWalletRegistryV2
    function setHub(address newHub) external onlyOwner {
        if (newHub == address(0)) revert WalletRegistryV2__ZeroAddress();
        address oldHub = hub;
        hub = newHub;
        emit HubUpdated(oldHub, newHub);
    }

    /// @inheritdoc IWalletRegistryV2
    function setOperatorSubmitter(address newOperatorSubmitter) external onlyOwner {
        if (newOperatorSubmitter == address(0)) revert WalletRegistryV2__ZeroAddress();
        address oldOperatorSubmitter = operatorSubmitter;
        operatorSubmitter = newOperatorSubmitter;
        emit OperatorSubmitterUpdated(oldOperatorSubmitter, newOperatorSubmitter);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ITransactionRegistry } from "../interfaces/ITransactionRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { CAIP10Evm } from "../libraries/CAIP10Evm.sol";
import { EIP712Constants } from "../libraries/EIP712Constants.sol";

/// @title TransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Stolen transaction registry with two-phase batch registration
/// @dev Extracted from FraudRegistryHub for contract size optimization.
///      Key features:
///      - Chain-qualified reference interface (similar to CAIP-10 but for transactions)
///      - Two-phase registration with dataHash commitment
///      - Single-phase for operator/cross-chain submissions
contract TransactionRegistry is ITransactionRegistry, EIP712, Ownable2Step {
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

    /// @notice Transaction entries: storage key => TransactionEntry
    mapping(bytes32 => TransactionEntry) private _transactions;

    /// @notice Batch metadata
    mapping(uint256 => TransactionBatch) private _batches;

    /// @notice Next batch ID
    uint256 private _nextBatchId = 1;

    /// @notice Pending acknowledgements for two-phase registration
    mapping(address => TransactionAcknowledgementData) private _pendingAcknowledgements;

    /// @notice Nonces for replay protection (keyed to reporter address)
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

    /// @notice Initialize the transaction registry
    /// @param _owner Initial owner
    /// @param _feeManager FeeManager contract (address(0) for free registrations)
    /// @param _graceBlocks Base blocks for grace period
    /// @param _deadlineBlocks Base blocks for deadline window
    constructor(address _owner, address _feeManager, uint256 _graceBlocks, uint256 _deadlineBlocks)
        EIP712("StolenWalletRegistry", "4")
        Ownable(_owner)
    {
        if (_owner == address(0)) revert TransactionRegistry__ZeroAddress();

        // Validate timing
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert TransactionRegistry__DeadlineInPast();
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
            revert TransactionRegistry__OnlyHub();
        }
        _;
    }

    modifier onlyOperatorSubmitter() {
        if (msg.sender != operatorSubmitter || operatorSubmitter == address(0)) {
            revert TransactionRegistry__OnlyOperatorSubmitter();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS - Fee Handling
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Collects fee via FeeManager and forwards to hub. Refunds excess to sender.
    ///      When hub == address(0), fees are held in this contract and can be recovered
    ///      via withdrawCollectedFees().
    function _collectFee() internal {
        if (feeManager == address(0)) return;

        uint256 requiredFee = IFeeManager(feeManager).currentFeeWei();
        if (msg.value < requiredFee) {
            revert TransactionRegistry__InsufficientFee();
        }

        // Forward to hub (fees held locally if hub not yet configured)
        if (hub != address(0)) {
            (bool success,) = hub.call{ value: requiredFee }("");
            if (!success) {
                revert TransactionRegistry__HubTransferFailed();
            }
        }

        // Refund excess
        uint256 excess = msg.value - requiredFee;
        if (excess > 0) {
            (bool refundSuccess,) = msg.sender.call{ value: excess }("");
            if (!refundSuccess) {
                revert TransactionRegistry__RefundFailed();
            }
        }
    }

    /// @notice Withdraw fees held when hub was not configured
    /// @dev Only callable by owner. Sends entire contract balance to owner.
    function withdrawCollectedFees() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) return;
        (bool success,) = msg.sender.call{ value: balance }("");
        if (!success) revert TransactionRegistry__RefundFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Chain-Qualified Reference Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITransactionRegistry
    function isTransactionRegistered(string calldata chainQualifiedRef) external view returns (bool) {
        // Parse: namespace:chainId:txHash
        (,, uint256 txStart, uint256 txLen) = CAIP10.parse(chainQualifiedRef);
        // Validate tx hash length: 66 chars = "0x" + 64 hex chars (standard EVM tx hash)
        require(txLen == 66, "Invalid tx hash length");
        bytes32 txHash = CAIP10Evm.parseHexToBytes32(chainQualifiedRef, txStart, txLen);

        // Compute storage key using CAIP-2 hash extracted directly from the string
        bytes32 chainId = CAIP10.extractCaip2Hash(chainQualifiedRef);
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);

        return _transactions[key].registeredAt > 0;
    }

    /// @inheritdoc ITransactionRegistry
    function getTransactionEntry(string calldata chainQualifiedRef) external view returns (TransactionEntry memory) {
        (,, uint256 txStart, uint256 txLen) = CAIP10.parse(chainQualifiedRef);
        // Validate tx hash length: 66 chars = "0x" + 64 hex chars (standard EVM tx hash)
        require(txLen == 66, "Invalid tx hash length");
        bytes32 txHash = CAIP10Evm.parseHexToBytes32(chainQualifiedRef, txStart, txLen);

        bytes32 chainId = CAIP10.extractCaip2Hash(chainQualifiedRef);
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);

        return _transactions[key];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Typed Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITransactionRegistry
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool) {
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);
        return _transactions[key].registeredAt > 0;
    }

    /// @inheritdoc ITransactionRegistry
    function getTransactionEntry(bytes32 txHash, bytes32 chainId) external view returns (TransactionEntry memory) {
        bytes32 key = CAIP10.txStorageKey(txHash, chainId);
        return _transactions[key];
    }

    /// @inheritdoc ITransactionRegistry
    function isTransactionPending(address reporter) external view returns (bool) {
        TransactionAcknowledgementData memory ack = _pendingAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.deadline;
    }

    /// @inheritdoc ITransactionRegistry
    function getTransactionAcknowledgementData(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory)
    {
        return _pendingAcknowledgements[reporter];
    }

    /// @inheritdoc ITransactionRegistry
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
        )
    {
        TransactionAcknowledgementData memory ack = _pendingAcknowledgements[reporter];
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

    /// @inheritdoc ITransactionRegistry
    function generateTransactionHashStruct(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address trustedForwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct) {
        if (step != 1 && step != 2) revert TransactionRegistry__InvalidStep();
        deadline = TimingConfig.getSignatureDeadline();
        if (step == 1) {
            // Acknowledgement
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_ACK_TYPEHASH,
                    EIP712Constants.TX_ACK_STATEMENT_HASH,
                    msg.sender, // reporter
                    trustedForwarder,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            // Registration
            hashStruct = keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_REG_TYPEHASH,
                    EIP712Constants.TX_REG_STATEMENT_HASH,
                    msg.sender,
                    trustedForwarder,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonces[msg.sender],
                    deadline
                )
            );
        }
    }

    /// @inheritdoc ITransactionRegistry
    function getTransactionBatch(uint256 batchId) external view returns (TransactionBatch memory) {
        return _batches[batchId];
    }

    /// @inheritdoc ITransactionRegistry
    function transactionBatchCount() external view returns (uint256) {
        return _nextBatchId - 1;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE QUOTING (Unified interface matching SpokeRegistry)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITransactionRegistry
    function quoteRegistration(
        address /* reporter */
    )
        external
        view
        returns (uint256)
    {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).currentFeeWei();
    }

    /// @inheritdoc ITransactionRegistry
    function quoteFeeBreakdown(
        address /* reporter */
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

    /// @dev Verify EIP-712 acknowledgement signature (internal to reduce stack depth in caller)
    function _verifyAckSignature(
        address reporter,
        address trustedForwarder,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_ACK_TYPEHASH,
                    EIP712Constants.TX_ACK_STATEMENT_HASH,
                    reporter,
                    trustedForwarder,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != reporter) {
            revert TransactionRegistry__InvalidSignature();
        }
    }

    /// @inheritdoc ITransactionRegistry
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
    ) external {
        if (reporter == address(0)) revert TransactionRegistry__ZeroAddress();
        if (trustedForwarder == address(0)) revert TransactionRegistry__ZeroAddress();
        if (dataHash == bytes32(0)) revert TransactionRegistry__DataHashMismatch();
        if (transactionCount == 0) revert TransactionRegistry__EmptyBatch();
        if (deadline <= block.timestamp) revert TransactionRegistry__DeadlineExpired();

        // Check not already acknowledged
        {
            TransactionAcknowledgementData memory existing = _pendingAcknowledgements[reporter];
            if (existing.trustedForwarder != address(0) && block.number < existing.deadline) {
                revert TransactionRegistry__AlreadyAcknowledged();
            }
        }

        uint256 nonce = nonces[reporter];

        // Verify EIP-712 signature (includes real reportedChainId + transactionCount)
        _verifyAckSignature(
            reporter, trustedForwarder, dataHash, reportedChainId, transactionCount, nonce, deadline, v, r, s
        );

        // Increment nonce
        nonces[reporter]++;

        // Derive isSponsored: if trustedForwarder != reporter, someone else is paying
        bool isSponsored = reporter != trustedForwarder;

        // Store acknowledgement (including reportedChainId + transactionCount for register-phase validation)
        _pendingAcknowledgements[reporter] = TransactionAcknowledgementData({
            deadline: TimingConfig.getDeadlineBlock(deadlineBlocks),
            nonce: nonce,
            gracePeriodStart: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            dataHash: dataHash,
            reportedChainId: reportedChainId,
            trustedForwarder: trustedForwarder,
            transactionCount: transactionCount,
            isSponsored: isSponsored
        });

        emit TransactionBatchAcknowledged(reporter, trustedForwarder, dataHash, isSponsored);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TWO-PHASE REGISTRATION - Phase 2: Registration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Build struct hash for tx batch registration signature
    function _buildTxBatchRegStructHash(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        uint32 txCount
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712Constants.TX_BATCH_REG_TYPEHASH,
                EIP712Constants.TX_REG_STATEMENT_HASH,
                reporter,
                msg.sender,
                dataHash,
                reportedChainId,
                txCount,
                nonce,
                deadline
            )
        );
    }

    /// @dev Execute batch registration (state changes)
    function _executeTxBatchRegistration(
        address reporter,
        bytes32 dataHash,
        bool isSponsored,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal {
        uint256 batchId = _nextBatchId++;

        // Register transactions, counting actual registrations
        bytes32 localSourceChainId = CAIP10Evm.caip2Hash(uint64(block.chainid));
        uint32 actualCount = 0;

        for (uint256 i = 0; i < transactionHashes.length; i++) {
            bytes32 txHash = transactionHashes[i];
            if (txHash == bytes32(0)) continue;

            bytes32 chainId = chainIds[i];
            bytes32 key = CAIP10.txStorageKey(txHash, chainId);

            if (_transactions[key].registeredAt > 0) continue;

            _transactions[key] = TransactionEntry({
                reportedChainId: chainId,
                sourceChainId: localSourceChainId,
                messageId: bytes32(0),
                reporter: reporter,
                registeredAt: uint64(block.timestamp),
                bridgeId: 0,
                isSponsored: isSponsored
            });

            actualCount++;
            emit TransactionRegistered(txHash, chainId, reporter, isSponsored);
        }

        // Write batch after loop with accurate count
        _batches[batchId] = TransactionBatch({
            operatorId: bytes32(0),
            dataHash: dataHash,
            reporter: reporter,
            timestamp: uint64(block.timestamp),
            transactionCount: actualCount
        });

        emit TransactionBatchRegistered(batchId, reporter, dataHash, actualCount, isSponsored);
    }

    /// @dev Internal signature verification for registration
    function _verifyRegistrationSignature(
        address reporter,
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 deadline,
        uint32 txCount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 structHash = _buildTxBatchRegStructHash(
            dataHash, reportedChainId, deadline, nonces[reporter], reporter, txCount
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != reporter) {
            revert TransactionRegistry__InvalidSignature();
        }
    }

    /// @inheritdoc ITransactionRegistry
    function registerTransactions(
        address reporter,
        uint256 deadline,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        if (reporter == address(0)) revert TransactionRegistry__ZeroAddress();
        if (transactionHashes.length == 0) revert TransactionRegistry__EmptyBatch();
        if (transactionHashes.length != chainIds.length) revert TransactionRegistry__ArrayLengthMismatch();
        if (deadline <= block.timestamp) revert TransactionRegistry__DeadlineExpired();

        // Load and validate acknowledgement
        TransactionAcknowledgementData memory ack = _pendingAcknowledgements[reporter];
        if (ack.trustedForwarder != msg.sender) revert TransactionRegistry__InvalidForwarder();
        if (block.number < ack.gracePeriodStart) revert TransactionRegistry__GracePeriodNotStarted();
        if (block.number >= ack.deadline) revert TransactionRegistry__DeadlineExpired();

        // Verify dataHash matches
        bytes32 dataHash = keccak256(abi.encode(transactionHashes, chainIds));
        if (dataHash != ack.dataHash) revert TransactionRegistry__DataHashMismatch();

        // Validate transactionCount matches acknowledge phase
        if (ack.transactionCount != uint32(transactionHashes.length)) {
            revert TransactionRegistry__ArrayLengthMismatch();
        }

        // Verify EIP-712 signature (uses real reportedChainId from ack data)
        _verifyRegistrationSignature(
            reporter, dataHash, ack.reportedChainId, deadline, uint32(transactionHashes.length), v, r, s
        );

        // === EFFECTS ===
        nonces[reporter]++;
        delete _pendingAcknowledgements[reporter];

        _executeTxBatchRegistration(reporter, dataHash, ack.isSponsored, transactionHashes, chainIds);

        // === INTERACTIONS ===
        _collectFee();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION (Hub Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Internal struct to pack cross-chain params (avoids stack too deep)
    struct CrossChainParams {
        bytes32 reportedChainId;
        bytes32 sourceChainId;
        bool isSponsored;
        uint8 bridgeId;
        bytes32 messageId;
    }

    /// @dev Execute cross-chain registration
    function _executeCrossChainRegistration(
        address reporter,
        bytes32 dataHash,
        CrossChainParams memory params,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal {
        uint256 batchId = _nextBatchId++;

        // Register transactions, counting actual registrations
        uint32 actualCount = 0;

        for (uint256 i = 0; i < transactionHashes.length; i++) {
            bytes32 txHash = transactionHashes[i];
            if (txHash == bytes32(0)) continue;

            bytes32 chainId = chainIds[i];
            bytes32 key = CAIP10.txStorageKey(txHash, chainId);

            if (_transactions[key].registeredAt > 0) continue;

            _transactions[key] = TransactionEntry({
                reportedChainId: params.reportedChainId,
                sourceChainId: params.sourceChainId,
                messageId: params.messageId,
                reporter: reporter,
                registeredAt: uint64(block.timestamp),
                bridgeId: params.bridgeId,
                isSponsored: params.isSponsored
            });

            actualCount++;
            emit TransactionRegistered(txHash, chainId, reporter, params.isSponsored);
            emit CrossChainTransactionRegistered(txHash, params.sourceChainId, params.bridgeId, params.messageId);
        }

        // Write batch after loop with accurate count
        _batches[batchId] = TransactionBatch({
            operatorId: bytes32(0),
            dataHash: dataHash,
            reporter: reporter,
            timestamp: uint64(block.timestamp),
            transactionCount: actualCount
        });

        // Only TransactionBatchRegistered — no duplicate TransactionBatchCreated for cross-chain
        emit TransactionBatchRegistered(batchId, reporter, dataHash, actualCount, params.isSponsored);
    }

    /// @inheritdoc ITransactionRegistry
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
    ) external onlyHub {
        if (transactionHashes.length == 0) revert TransactionRegistry__EmptyBatch();
        if (transactionHashes.length != chainIds.length) revert TransactionRegistry__ArrayLengthMismatch();

        CrossChainParams memory params = CrossChainParams({
            reportedChainId: reportedChainId,
            sourceChainId: sourceChainId,
            isSponsored: isSponsored,
            bridgeId: bridgeId,
            messageId: messageId
        });

        _executeCrossChainRegistration(reporter, dataHash, params, transactionHashes, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITransactionRegistry
    function registerTransactionsFromOperator(
        bytes32 operatorId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) external onlyOperatorSubmitter returns (uint256 batchId) {
        uint256 length = transactionHashes.length;

        if (length == 0) revert TransactionRegistry__EmptyBatch();
        if (length != chainIds.length) revert TransactionRegistry__ArrayLengthMismatch();

        // Create batch (transactionCount updated after loop with actual count)
        batchId = _nextBatchId++;

        // Register transactions, counting actual registrations
        bytes32 localSourceChainId = CAIP10Evm.caip2Hash(uint64(block.chainid));
        uint32 actualCount = 0;

        for (uint256 i = 0; i < length; i++) {
            bytes32 txHash = transactionHashes[i];
            if (txHash == bytes32(0)) continue;

            bytes32 chainId = chainIds[i];
            bytes32 key = CAIP10.txStorageKey(txHash, chainId);

            if (_transactions[key].registeredAt > 0) continue;

            _transactions[key] = TransactionEntry({
                reportedChainId: chainId,
                sourceChainId: localSourceChainId,
                messageId: bytes32(0),
                reporter: address(0), // Operator submission
                registeredAt: uint64(block.timestamp),
                bridgeId: 0,
                isSponsored: false
            });

            actualCount++;
            emit TransactionRegistered(txHash, chainId, address(0), false);
        }

        _batches[batchId] = TransactionBatch({
            operatorId: operatorId,
            dataHash: bytes32(0),
            reporter: address(0),
            timestamp: uint64(block.timestamp),
            transactionCount: actualCount
        });

        emit TransactionBatchCreated(batchId, operatorId, actualCount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITransactionRegistry
    function setHub(address newHub) external onlyOwner {
        if (newHub == address(0)) revert TransactionRegistry__ZeroAddress();
        address oldHub = hub;
        hub = newHub;
        emit HubUpdated(oldHub, newHub);
    }

    /// @inheritdoc ITransactionRegistry
    function setOperatorSubmitter(address newOperatorSubmitter) external onlyOwner {
        if (newOperatorSubmitter == address(0)) revert TransactionRegistry__ZeroAddress();
        address oldOperatorSubmitter = operatorSubmitter;
        operatorSubmitter = newOperatorSubmitter;
        emit OperatorSubmitterUpdated(oldOperatorSubmitter, newOperatorSubmitter);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { IStolenTransactionRegistry } from "../interfaces/IStolenTransactionRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";

/// @title StolenTransactionRegistry
/// @author Stolen Wallet Registry Team
/// @notice Registry for stolen transactions with two-phase registration using Merkle trees
/// @dev Implements IStolenTransactionRegistry with EIP-712 signature verification.
///      Two-phase registration prevents single-transaction phishing attacks:
///      1. Acknowledgement: Reporter signs intent, establishes trusted forwarder
///      2. Grace period: Randomized delay (1-4 minutes)
///      3. Registration: Reporter signs again, batch marked as stolen permanently
///
/// MERKLE TREE DESIGN:
/// - Leaf = keccak256(abi.encodePacked(txHash, chainId)) for multi-chain support
/// - Only merkleRoot stored on-chain (gas efficient)
/// - Full txHashes and chainIds emitted in events for data availability
/// - Verification requires both txHash AND chainId
contract StolenTransactionRegistry is IStolenTransactionRegistry, EIP712 {
    // ═══════════════════════════════════════════════════════════════════════════
    // TYPE HASHES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev EIP-712 type hash for acknowledgement phase
    // solhint-disable-next-line max-line-length
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)"
    );

    /// @dev EIP-712 type hash for registration phase
    // solhint-disable-next-line max-line-length
    bytes32 private constant REGISTRATION_TYPEHASH = keccak256(
        "TransactionBatchRegistration(bytes32 merkleRoot,bytes32 reportedChainId,address forwarder,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fee manager address (address(0) = free registrations)
    address public immutable feeManager;

    /// @notice Registry hub address for fee forwarding
    address public immutable registryHub;

    /// @notice Base blocks for grace period (chain-specific for consistent UX)
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for registration deadline (chain-specific for consistent UX)
    uint256 public immutable deadlineBlocks;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Completed batch registrations - persists permanently after registration
    /// @dev Key is batchId = keccak256(merkleRoot, reporter, reportedChainId)
    mapping(bytes32 => TransactionBatch) private registeredBatches;

    /// @notice Pending acknowledgements - temporary, deleted after registration
    /// @dev Key is reporter address (one pending batch per reporter)
    mapping(address => AcknowledgementData) private pendingAcknowledgements;

    /// @notice Nonces for replay protection - increments on both ACK and REG
    mapping(address => uint256) public nonces;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the registry with EIP-712 domain separator and fee configuration
    /// @dev Version "4" to align with frontend EIP-712 domain
    /// @param _feeManager FeeManager contract address (address(0) for free registrations)
    /// @param _registryHub RegistryHub contract address for fee forwarding
    /// @param _graceBlocks Base blocks for grace period (chain-specific)
    /// @param _deadlineBlocks Base blocks for deadline window (chain-specific)
    constructor(address _feeManager, address _registryHub, uint256 _graceBlocks, uint256 _deadlineBlocks)
        EIP712("StolenTransactionRegistry", "4")
    {
        // Validate fee configuration consistency
        if (_feeManager != address(0) && _registryHub == address(0)) {
            revert InvalidFeeConfig();
        }

        // Validate timing parameters: deadlineBlocks >= 2 * graceBlocks
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert InvalidTimingConfig();
        }

        feeManager = _feeManager;
        registryHub = _registryHub;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenTransactionRegistry
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
    ) external {
        // Validate inputs
        _validateAcknowledgementInputs(
            merkleRoot, reportedChainId, transactionCount, transactionHashes, chainIds, deadline
        );

        // Validate reporter address
        if (reporter == address(0)) revert InvalidReporter();

        // Verify signature from reporter with correct nonce
        _verifyAcknowledgementSignature(merkleRoot, reportedChainId, transactionCount, reporter, deadline, v, r, s);

        // Verify Merkle root matches the provided transaction hashes
        if (_computeMerkleRoot(transactionHashes, chainIds) != merkleRoot) revert MerkleRootMismatch();

        // Check if batch already registered
        _requireNotRegistered(merkleRoot, reporter, reportedChainId);

        // Increment nonce AFTER validation to prevent replay
        nonces[reporter]++;

        // Store acknowledgement with randomized grace period timing
        _storeAcknowledgement(reporter, merkleRoot, reportedChainId, transactionCount);

        emit TransactionBatchAcknowledged(
            merkleRoot, reporter, msg.sender, reportedChainId, transactionCount, reporter != msg.sender
        );
    }

    /// @inheritdoc IStolenTransactionRegistry
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
    ) external payable {
        // Validate inputs and deadline
        _validateRegistrationInputs(merkleRoot, reportedChainId, transactionHashes, chainIds, deadline);

        // Validate reporter address
        if (reporter == address(0)) revert InvalidReporter();

        // Verify Merkle root matches the provided transaction hashes
        if (_computeMerkleRoot(transactionHashes, chainIds) != merkleRoot) revert MerkleRootMismatch();

        // Verify signature from reporter with correct nonce
        _verifyRegistrationSignature(merkleRoot, reportedChainId, reporter, deadline, v, r, s);

        // Validate acknowledgement and timing windows
        _validateAcknowledgementForRegistration(reporter, merkleRoot, reportedChainId, transactionHashes.length);

        // Validate fee payment
        _validateFeePayment();

        // Complete registration
        _completeRegistration(reporter, merkleRoot, reportedChainId, transactionHashes, chainIds);
    }

    /// @inheritdoc IStolenTransactionRegistry
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
    ) external {
        // Only RegistryHub can call this function
        if (msg.sender != registryHub) revert UnauthorizedCaller();

        // Validate inputs
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (reporter == address(0)) revert InvalidReporter();
        if (reportedChainId == bytes32(0)) revert InvalidChainId();
        if (sourceChainId == bytes32(0)) revert InvalidChainId();
        if (transactionCount == 0) revert InvalidTransactionCount();
        if (bridgeId > uint8(BridgeId.WORMHOLE)) revert InvalidBridgeId();
        if (transactionHashes.length != chainIds.length) revert ArrayLengthMismatch();
        if (transactionHashes.length != transactionCount) revert InvalidTransactionCount();

        // Verify Merkle root matches the provided transaction hashes
        if (_computeMerkleRoot(transactionHashes, chainIds) != merkleRoot) revert MerkleRootMismatch();

        bytes32 batchId = _computeBatchId(merkleRoot, reporter, reportedChainId);

        // Prevent re-registration
        if (registeredBatches[batchId].registeredAt != 0) revert AlreadyRegistered();

        // Store the cross-chain registration
        registeredBatches[batchId] = TransactionBatch({
            merkleRoot: merkleRoot,
            reporter: reporter,
            reportedChainId: reportedChainId,
            sourceChainId: sourceChainId,
            registeredAt: uint64(block.number),
            transactionCount: transactionCount,
            bridgeId: bridgeId,
            isSponsored: isSponsored,
            operatorVerified: false,
            crossChainMessageId: crossChainMessageId
        });

        emit TransactionBatchRegistered(
            batchId, merkleRoot, reporter, reportedChainId, transactionCount, isSponsored, transactionHashes, chainIds
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary Query Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenTransactionRegistry
    function isBatchRegistered(bytes32 batchId) external view returns (bool) {
        return registeredBatches[batchId].registeredAt != 0;
    }

    /// @inheritdoc IStolenTransactionRegistry
    function isPending(address reporter) external view returns (bool) {
        AcknowledgementData memory ack = pendingAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc IStolenTransactionRegistry
    function getBatch(bytes32 batchId) external view returns (TransactionBatch memory) {
        return registeredBatches[batchId];
    }

    /// @inheritdoc IStolenTransactionRegistry
    function getAcknowledgement(address reporter) external view returns (AcknowledgementData memory) {
        return pendingAcknowledgements[reporter];
    }

    /// @inheritdoc IStolenTransactionRegistry
    function verifyTransaction(bytes32 txHash, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool)
    {
        TransactionBatch memory batch = registeredBatches[batchId];
        if (batch.registeredAt == 0) return false;

        // Reconstruct leaf: keccak256(abi.encodePacked(txHash, chainId))
        bytes32 leaf = keccak256(abi.encodePacked(txHash, chainId));

        // Verify proof against stored Merkle root
        return MerkleProof.verify(merkleProof, batch.merkleRoot, leaf);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenTransactionRegistry
    function generateHashStruct(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address forwarder,
        uint8 step
    ) external view returns (uint256 deadline, bytes32 hashStruct) {
        deadline = TimingConfig.getSignatureDeadline();

        if (step == 1) {
            // Acknowledgement
            hashStruct = keccak256(
                abi.encode(
                    ACKNOWLEDGEMENT_TYPEHASH,
                    merkleRoot,
                    reportedChainId,
                    transactionCount,
                    forwarder,
                    nonces[msg.sender],
                    deadline
                )
            );
        } else {
            // Registration
            hashStruct = keccak256(
                abi.encode(REGISTRATION_TYPEHASH, merkleRoot, reportedChainId, forwarder, nonces[msg.sender], deadline)
            );
        }
    }

    /// @inheritdoc IStolenTransactionRegistry
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
        )
    {
        AcknowledgementData memory ack = pendingAcknowledgements[reporter];
        currentBlock = uint32(block.number);
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;

        if (ack.expiryBlock <= block.number) {
            isExpired = true;
            timeLeft = 0;
            graceStartsAt = 0;
        } else {
            isExpired = false;
            timeLeft = ack.expiryBlock - uint32(block.number);
            graceStartsAt = ack.startBlock > block.number ? ack.startBlock - uint32(block.number) : 0;
        }
    }

    /// @inheritdoc IStolenTransactionRegistry
    function quoteRegistration(
        address /* reporter - unused */
    )
        external
        view
        returns (uint256)
    {
        if (feeManager == address(0)) {
            return 0;
        }
        return IFeeManager(feeManager).currentFeeWei();
    }

    /// @inheritdoc IStolenTransactionRegistry
    function computeBatchId(bytes32 merkleRoot, address reporter, bytes32 reportedChainId)
        external
        pure
        returns (bytes32)
    {
        return _computeBatchId(merkleRoot, reporter, reportedChainId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute batch ID from batch parameters
    function _computeBatchId(bytes32 merkleRoot, address reporter, bytes32 reportedChainId)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(merkleRoot, reporter, reportedChainId));
    }

    /// @notice Check if batch is already registered (reduces stack depth at call sites)
    function _requireNotRegistered(bytes32 merkleRoot, address reporter, bytes32 reportedChainId) internal view {
        if (registeredBatches[_computeBatchId(merkleRoot, reporter, reportedChainId)].registeredAt != 0) {
            revert AlreadyRegistered();
        }
    }

    /// @notice Compute Merkle root from transaction hashes and chain IDs
    /// @dev Uses sorted leaf insertion for consistent ordering
    function _computeMerkleRoot(bytes32[] calldata txHashes, bytes32[] calldata chainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = txHashes.length;
        if (length == 0) return bytes32(0);

        // Build leaves: keccak256(abi.encodePacked(txHash, chainId))
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = keccak256(abi.encodePacked(txHashes[i], chainIds[i]));
        }

        // Sort leaves for consistent ordering (OpenZeppelin merkle-tree does this)
        _sortBytes32Array(leaves);

        // Build tree bottom-up
        while (length > 1) {
            uint256 newLength = (length + 1) / 2;
            for (uint256 i = 0; i < newLength; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                if (right < length) {
                    // Hash pair in sorted order (OpenZeppelin standard)
                    if (leaves[left] < leaves[right]) {
                        leaves[i] = keccak256(abi.encodePacked(leaves[left], leaves[right]));
                    } else {
                        leaves[i] = keccak256(abi.encodePacked(leaves[right], leaves[left]));
                    }
                } else {
                    // Odd node - promote to next level
                    leaves[i] = leaves[left];
                }
            }
            length = newLength;
        }

        return leaves[0];
    }

    /// @notice Sort bytes32 array in ascending order (insertion sort for small arrays)
    function _sortBytes32Array(bytes32[] memory arr) internal pure {
        uint256 n = arr.length;
        for (uint256 i = 1; i < n; i++) {
            bytes32 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }

    /// @notice Validate acknowledgement inputs (helper to reduce stack depth)
    function _validateAcknowledgementInputs(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint256 deadline
    ) internal view {
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (reportedChainId == bytes32(0)) revert InvalidChainId();
        if (transactionCount == 0) revert InvalidTransactionCount();
        if (transactionHashes.length != chainIds.length) revert ArrayLengthMismatch();
        if (transactionHashes.length != transactionCount) revert InvalidTransactionCount();
        if (deadline <= block.timestamp) revert Acknowledgement__Expired();
    }

    /// @notice Verify acknowledgement signature from reporter
    function _verifyAcknowledgementSignature(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address reporter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        uint256 expectedNonce = nonces[reporter];
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ACKNOWLEDGEMENT_TYPEHASH,
                    merkleRoot,
                    reportedChainId,
                    transactionCount,
                    msg.sender, // forwarder
                    expectedNonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer != reporter) revert Acknowledgement__InvalidSigner();
    }

    /// @notice Verify registration signature from reporter
    function _verifyRegistrationSignature(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address reporter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        uint256 expectedNonce = nonces[reporter];
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REGISTRATION_TYPEHASH,
                    merkleRoot,
                    reportedChainId,
                    msg.sender, // forwarder
                    expectedNonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer != reporter) revert Registration__InvalidSigner();
    }

    /// @notice Store acknowledgement data (helper to reduce stack depth)
    function _storeAcknowledgement(
        address reporter,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount
    ) internal {
        pendingAcknowledgements[reporter] = AcknowledgementData({
            pendingMerkleRoot: merkleRoot,
            pendingChainId: reportedChainId,
            trustedForwarder: msg.sender,
            pendingTxCount: transactionCount,
            startBlock: uint32(TimingConfig.getGracePeriodEndBlock(graceBlocks)),
            expiryBlock: uint32(TimingConfig.getDeadlineBlock(deadlineBlocks))
        });
    }

    /// @notice Validate registration inputs (helper to reduce stack depth)
    function _validateRegistrationInputs(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint256 deadline
    ) internal view {
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (reportedChainId == bytes32(0)) revert InvalidChainId();
        if (transactionHashes.length != chainIds.length) revert ArrayLengthMismatch();
        if (deadline <= block.timestamp) revert Registration__SignatureExpired();
    }

    /// @notice Validate acknowledgement for registration (helper to reduce stack depth)
    function _validateAcknowledgementForRegistration(
        address reporter,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint256 txCount
    ) internal view {
        AcknowledgementData memory ack = pendingAcknowledgements[reporter];

        if (ack.trustedForwarder != msg.sender) revert Registration__InvalidForwarder();
        if (ack.pendingMerkleRoot != merkleRoot) revert MerkleRootMismatch();
        if (ack.pendingChainId != reportedChainId) revert InvalidChainId();
        if (ack.pendingTxCount != txCount) revert InvalidTransactionCount();
        if (block.number < ack.startBlock) revert Registration__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert Registration__ForwarderExpired();
    }

    /// @notice Validate fee payment (helper to reduce stack depth)
    function _validateFeePayment() internal view {
        if (feeManager != address(0)) {
            uint256 requiredFee = IFeeManager(feeManager).currentFeeWei();
            if (msg.value < requiredFee) revert InsufficientFee();
        }
    }

    /// @notice Complete registration and emit event (helper to reduce stack depth)
    function _completeRegistration(
        address reporter,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal {
        // State changes (CEI: effects before interactions)
        nonces[reporter]++;
        delete pendingAcknowledgements[reporter];

        bool isSponsored = reporter != msg.sender;
        bytes32 batchId = _computeBatchId(merkleRoot, reporter, reportedChainId);
        uint32 txCount = uint32(transactionHashes.length);

        registeredBatches[batchId] = TransactionBatch({
            merkleRoot: merkleRoot,
            reporter: reporter,
            reportedChainId: reportedChainId,
            sourceChainId: bytes32(0), // Native registration
            registeredAt: uint64(block.number),
            transactionCount: txCount,
            bridgeId: uint8(BridgeId.NONE),
            isSponsored: isSponsored,
            operatorVerified: false,
            crossChainMessageId: bytes32(0)
        });

        emit TransactionBatchRegistered(
            batchId, merkleRoot, reporter, reportedChainId, txCount, isSponsored, transactionHashes, chainIds
        );

        // Forward fee to RegistryHub (external call last)
        if (registryHub != address(0) && msg.value > 0) {
            (bool success,) = registryHub.call{ value: msg.value }("");
            if (!success) revert FeeForwardFailed();
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { IFraudulentContractRegistry } from "../interfaces/IFraudulentContractRegistry.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";

/// @title FraudulentContractRegistry
/// @author Stolen Wallet Registry Team
/// @notice Operator-only registry for cataloging malicious smart contracts
/// @dev Only approved operators can submit. Single-phase (no grace period).
///      Uses Merkle trees for gas-efficient batch submissions.
contract FraudulentContractRegistry is IFraudulentContractRegistry, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Capability bit required for this registry
    uint8 private constant CONTRACT_REGISTRY_CAPABILITY = 0x04;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudulentContractRegistry
    address public immutable override operatorRegistry;

    /// @inheritdoc IFraudulentContractRegistry
    address public immutable override feeManager;

    /// @inheritdoc IFraudulentContractRegistry
    address public immutable override registryHub;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Registered batches: batchId => ContractBatch
    mapping(bytes32 => ContractBatch) private _batches;

    /// @notice Invalidated entries: entryHash => invalidated
    mapping(bytes32 => bool) private _invalidatedEntries;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the registry
    /// @param _owner DAO address for admin functions
    /// @param _operatorRegistry OperatorRegistry contract address
    /// @param _feeManager FeeManager contract address (address(0) for free)
    /// @param _registryHub RegistryHub for fee forwarding
    constructor(address _owner, address _operatorRegistry, address _feeManager, address _registryHub) Ownable(_owner) {
        require(_operatorRegistry != address(0), "Invalid operator registry");

        operatorRegistry = _operatorRegistry;
        feeManager = _feeManager;
        registryHub = _registryHub;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Require caller is an approved operator with CONTRACT_REGISTRY capability
    modifier onlyApprovedOperator() {
        if (!IOperatorRegistry(operatorRegistry).isApprovedFor(msg.sender, CONTRACT_REGISTRY_CAPABILITY)) {
            revert FraudulentContractRegistry__NotApprovedOperator();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudulentContractRegistry
    function registerBatch(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address[] calldata contractAddresses,
        bytes32[] calldata chainIds
    ) external payable onlyApprovedOperator {
        // Validate inputs
        if (merkleRoot == bytes32(0)) revert FraudulentContractRegistry__InvalidMerkleRoot();
        if (reportedChainId == bytes32(0)) revert FraudulentContractRegistry__InvalidChainId();
        if (contractAddresses.length == 0) revert FraudulentContractRegistry__InvalidContractCount();
        if (contractAddresses.length != chainIds.length) revert FraudulentContractRegistry__ArrayLengthMismatch();

        // Verify merkle root matches provided data
        bytes32 computedRoot = _computeMerkleRoot(contractAddresses, chainIds);
        if (computedRoot != merkleRoot) revert FraudulentContractRegistry__MerkleRootMismatch();

        // Compute batch ID
        bytes32 batchId = _computeBatchId(merkleRoot, msg.sender, reportedChainId);

        // Check not already registered
        if (_batches[batchId].registeredAt != 0) revert FraudulentContractRegistry__AlreadyRegistered();

        // Validate fee payment
        _validateFeePayment();

        // Store batch
        _batches[batchId] = ContractBatch({
            merkleRoot: merkleRoot,
            operator: msg.sender,
            reportedChainId: reportedChainId,
            registeredAt: uint64(block.number),
            contractCount: uint32(contractAddresses.length),
            invalidated: false
        });

        emit ContractBatchRegistered(
            batchId,
            merkleRoot,
            msg.sender,
            reportedChainId,
            uint32(contractAddresses.length),
            contractAddresses,
            chainIds
        );

        // Forward fee to RegistryHub
        if (registryHub != address(0) && msg.value > 0) {
            (bool success,) = registryHub.call{ value: msg.value }("");
            if (!success) revert FraudulentContractRegistry__FeeForwardFailed();
        }
    }

    /// @inheritdoc IFraudulentContractRegistry
    function invalidateBatch(bytes32 batchId) external onlyOwner {
        ContractBatch storage batch = _batches[batchId];
        if (batch.registeredAt == 0) revert FraudulentContractRegistry__BatchNotFound();
        if (batch.invalidated) revert FraudulentContractRegistry__AlreadyInvalidated();

        batch.invalidated = true;

        emit BatchInvalidated(batchId, msg.sender);
    }

    /// @inheritdoc IFraudulentContractRegistry
    function invalidateEntry(bytes32 entryHash) external onlyOwner {
        if (_invalidatedEntries[entryHash]) revert FraudulentContractRegistry__AlreadyInvalidated();

        _invalidatedEntries[entryHash] = true;

        emit EntryInvalidated(entryHash, msg.sender);
    }

    /// @inheritdoc IFraudulentContractRegistry
    function reinstateEntry(bytes32 entryHash) external onlyOwner {
        if (!_invalidatedEntries[entryHash]) revert FraudulentContractRegistry__NotInvalidated();

        _invalidatedEntries[entryHash] = false;

        emit EntryReinstated(entryHash, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudulentContractRegistry
    function isBatchRegistered(bytes32 batchId) external view returns (bool) {
        ContractBatch memory batch = _batches[batchId];
        return batch.registeredAt != 0 && !batch.invalidated;
    }

    /// @inheritdoc IFraudulentContractRegistry
    function verifyContract(address contractAddress, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool)
    {
        ContractBatch memory batch = _batches[batchId];

        // Batch must exist and not be invalidated
        if (batch.registeredAt == 0 || batch.invalidated) return false;

        // Entry must not be individually invalidated
        bytes32 entryHash = _computeEntryHash(contractAddress, chainId);
        if (_invalidatedEntries[entryHash]) return false;

        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(contractAddress, chainId));
        return MerkleProof.verify(merkleProof, batch.merkleRoot, leaf);
    }

    /// @inheritdoc IFraudulentContractRegistry
    function getBatch(bytes32 batchId) external view returns (ContractBatch memory) {
        return _batches[batchId];
    }

    /// @inheritdoc IFraudulentContractRegistry
    function isEntryInvalidated(bytes32 entryHash) external view returns (bool) {
        return _invalidatedEntries[entryHash];
    }

    /// @inheritdoc IFraudulentContractRegistry
    function computeBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        external
        pure
        returns (bytes32)
    {
        return _computeBatchId(merkleRoot, operator, reportedChainId);
    }

    /// @inheritdoc IFraudulentContractRegistry
    function computeEntryHash(address contractAddress, bytes32 chainId) external pure returns (bytes32) {
        return _computeEntryHash(contractAddress, chainId);
    }

    /// @inheritdoc IFraudulentContractRegistry
    function quoteRegistration() external view returns (uint256) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).operatorBatchFeeWei();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _computeBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(merkleRoot, operator, reportedChainId));
    }

    function _computeEntryHash(address contractAddress, bytes32 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(contractAddress, chainId));
    }

    function _validateFeePayment() internal view {
        if (feeManager != address(0)) {
            uint256 requiredFee = IFeeManager(feeManager).operatorBatchFeeWei();
            if (msg.value < requiredFee) revert FraudulentContractRegistry__InsufficientFee();
        }
    }

    /// @notice Compute Merkle root from contract addresses and chain IDs
    /// @dev Uses sorted leaf insertion for consistent ordering (OpenZeppelin standard)
    function _computeMerkleRoot(address[] calldata contractAddresses, bytes32[] calldata chainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = contractAddresses.length;
        if (length == 0) return bytes32(0);

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = keccak256(abi.encodePacked(contractAddresses[i], chainIds[i]));
        }

        // Sort leaves for consistent ordering
        _sortBytes32Array(leaves);

        // Build tree bottom-up
        while (length > 1) {
            uint256 newLength = (length + 1) / 2;
            for (uint256 i = 0; i < newLength; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                if (right < length) {
                    // Hash pair in sorted order
                    if (leaves[left] < leaves[right]) {
                        leaves[i] = keccak256(abi.encodePacked(leaves[left], leaves[right]));
                    } else {
                        leaves[i] = keccak256(abi.encodePacked(leaves[right], leaves[left]));
                    }
                } else {
                    leaves[i] = leaves[left];
                }
            }
            length = newLength;
        }

        return leaves[0];
    }

    /// @notice Sort bytes32 array in ascending order
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
}

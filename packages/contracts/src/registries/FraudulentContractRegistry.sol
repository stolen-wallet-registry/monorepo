// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { IFraudulentContractRegistry } from "../interfaces/IFraudulentContractRegistry.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { MerkleRootComputation } from "../libraries/MerkleRootComputation.sol";
import { RegistryCapabilities } from "../libraries/RegistryCapabilities.sol";

/// @title FraudulentContractRegistry
/// @author Stolen Wallet Registry Team
/// @notice Operator-only registry for cataloging malicious smart contracts
/// @dev Only approved operators can submit. Single-phase (no grace period).
///      Uses Merkle trees for gas-efficient batch submissions.
contract FraudulentContractRegistry is IFraudulentContractRegistry, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Capability bit required for this registry (from shared library)
    uint8 private constant CONTRACT_REGISTRY_CAPABILITY = RegistryCapabilities.CONTRACT_REGISTRY;

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
        if (_operatorRegistry == address(0)) revert FraudulentContractRegistry__InvalidOperatorRegistry();
        // If fees are enabled, registryHub must be set to receive them (otherwise fees are trapped)
        if (_feeManager != address(0) && _registryHub == address(0)) {
            revert FraudulentContractRegistry__MissingRegistryHub();
        }

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
        if (contractAddresses.length > 1000) revert FraudulentContractRegistry__BatchSizeExceedsLimit();
        if (contractAddresses.length != chainIds.length) revert FraudulentContractRegistry__ArrayLengthMismatch();

        // Validate each entry - reject zero addresses and zero chainIds
        for (uint256 i = 0; i < contractAddresses.length; i++) {
            if (contractAddresses[i] == address(0)) revert FraudulentContractRegistry__InvalidContractAddress();
            if (chainIds[i] == bytes32(0)) revert FraudulentContractRegistry__InvalidChainIdEntry();
        }

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

        // Forward fee to RegistryHub or revert if ETH would be trapped
        if (msg.value > 0) {
            if (feeManager == address(0) && registryHub == address(0)) {
                revert FraudulentContractRegistry__UnexpectedEthWithFeesDisabled();
            }
            if (registryHub != address(0)) {
                (bool success,) = registryHub.call{ value: msg.value }("");
                if (!success) revert FraudulentContractRegistry__FeeForwardFailed();
            }
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

        // Verify merkle proof (OZ StandardMerkleTree leaf format)
        bytes32 leaf = MerkleRootComputation.hashLeaf(contractAddress, chainId);
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
    // INTERNAL FUNCTIONS - Registry-Specific Merkle Functions
    // ═══════════════════════════════════════════════════════════════════════════
    // These functions are intentionally per-registry because:
    // - Batch IDs: Include registry-specific identifiers (merkleRoot + operator + chainId)
    // - Entry hashes (leaves): Use registry-specific types (address for contracts)
    // - The MerkleRootComputation library handles the tree-building algorithm only
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute batch ID from parameters
    /// @dev Registry-specific: includes reportedChainId for batch uniqueness across chains
    /// @param merkleRoot The merkle root of the batch
    /// @param operator The operator address
    /// @param reportedChainId The reported chain ID
    /// @return The computed batch ID
    function _computeBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(merkleRoot, operator, reportedChainId));
    }

    /// @notice Compute entry hash (Merkle leaf) for a contract address
    /// @dev Registry-specific: uses OZ StandardMerkleTree leaf format
    /// @param contractAddress The contract address
    /// @param chainId The chain ID
    /// @return The computed entry hash
    function _computeEntryHash(address contractAddress, bytes32 chainId) internal pure returns (bytes32) {
        return MerkleRootComputation.hashLeaf(contractAddress, chainId);
    }

    /// @notice Validate that sufficient fee was provided
    function _validateFeePayment() internal view {
        if (feeManager != address(0)) {
            uint256 requiredFee = IFeeManager(feeManager).operatorBatchFeeWei();
            if (msg.value < requiredFee) revert FraudulentContractRegistry__InsufficientFee();
        }
    }

    /// @notice Compute Merkle root from contract addresses and chain IDs
    /// @dev Uses OZ StandardMerkleTree leaf format, then delegates to
    ///      MerkleRootComputation library for tree building
    /// @param contractAddresses Array of contract addresses
    /// @param chainIds Array of chain IDs
    /// @return The computed merkle root
    function _computeMerkleRoot(address[] calldata contractAddresses, bytes32[] calldata chainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = contractAddresses.length;
        if (length == 0) return bytes32(0);

        // Build leaves in OZ StandardMerkleTree format
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(contractAddresses[i], chainIds[i]);
        }

        return MerkleRootComputation.computeRoot(leaves);
    }
}

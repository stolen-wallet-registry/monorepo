// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { IContractRegistry } from "../interfaces/IContractRegistry.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { CAIP10Evm } from "../libraries/CAIP10Evm.sol";

/// @title ContractRegistry
/// @author Stolen Wallet Registry Team
/// @notice Malicious contract registry - operator-only submissions
/// @dev Extracted from FraudRegistryHub for contract size optimization.
///      Key features:
///      - CAIP-10 string interface with typed EVM overloads
///      - Single-phase registration (operators are trusted)
///      - Chain-specific storage keys (contracts may differ per chain)
///
///      NOTE: This registry is operator-only because:
///      - Contract maliciousness requires technical expertise to verify
///      - DAO-approved operators (security firms) provide trusted bulk intel
///      - Operator approval process substitutes for two-phase EIP-712 protection
contract ContractRegistry is IContractRegistry, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Maximum number of entries in a single operator batch
    uint256 public constant MAX_BATCH_SIZE = 10_000;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Contract entries: storage key => ContractEntry
    mapping(bytes32 => ContractEntry) private _contracts;

    /// @notice Batch metadata
    mapping(uint256 => ContractBatch) private _batches;

    /// @notice Next batch ID
    uint256 private _nextBatchId = 1;

    /// @notice Operator submitter contract address
    address public operatorSubmitter;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the contract registry
    /// @param _owner Initial owner
    constructor(address _owner) Ownable(_owner) {
        if (_owner == address(0)) revert ContractRegistry__ZeroAddress();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyOperatorSubmitter() {
        if (msg.sender != operatorSubmitter || operatorSubmitter == address(0)) {
            revert ContractRegistry__OnlyOperatorSubmitter();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - CAIP-10 String Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IContractRegistry
    function isContractRegistered(string calldata caip10) external view returns (bool) {
        bytes32 key = _resolveContractKey(caip10);
        return _contracts[key].registeredAt > 0;
    }

    /// @inheritdoc IContractRegistry
    function getContractEntry(string calldata caip10) external view returns (ContractEntry memory) {
        bytes32 key = _resolveContractKey(caip10);
        return _contracts[key];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Typed EVM Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IContractRegistry
    function isContractRegistered(address contractAddress, bytes32 chainId) external view returns (bool) {
        bytes32 key = CAIP10.contractStorageKey(contractAddress, chainId);
        return _contracts[key].registeredAt > 0;
    }

    /// @inheritdoc IContractRegistry
    function getContractEntry(address contractAddress, bytes32 chainId) external view returns (ContractEntry memory) {
        bytes32 key = CAIP10.contractStorageKey(contractAddress, chainId);
        return _contracts[key];
    }

    /// @inheritdoc IContractRegistry
    function getContractBatch(uint256 batchId) external view returns (ContractBatch memory) {
        return _batches[batchId];
    }

    /// @inheritdoc IContractRegistry
    function contractBatchCount() external view returns (uint256) {
        return _nextBatchId - 1;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IContractRegistry
    function registerContractsFromOperator(
        bytes32 operatorId,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint8[] calldata threatCategories
    ) external onlyOperatorSubmitter returns (uint256 batchId) {
        uint256 length = identifiers.length;

        if (length == 0) revert ContractRegistry__EmptyBatch();
        if (length > MAX_BATCH_SIZE) revert ContractRegistry__BatchTooLarge();
        if (length != reportedChainIds.length || length != threatCategories.length) {
            revert ContractRegistry__ArrayLengthMismatch();
        }

        // Create batch (contractCount updated after loop)
        batchId = _nextBatchId++;
        uint32 actualCount;

        // Register each contract
        for (uint256 i = 0; i < length; i++) {
            bytes32 identifier = identifiers[i];
            if (identifier == bytes32(0)) continue;

            bytes32 chainId = reportedChainIds[i];

            // For EVM, extract address and use contractStorageKey
            address contractAddr = address(uint160(uint256(identifier)));
            bytes32 key = CAIP10.contractStorageKey(contractAddr, chainId);

            if (_contracts[key].registeredAt > 0) continue;

            _contracts[key] = ContractEntry({
                registeredAt: uint64(block.timestamp), batchId: uint64(batchId), threatCategory: threatCategories[i]
            });

            actualCount++;
            emit ContractRegistered(identifier, chainId, operatorId, batchId);
        }

        if (actualCount == 0) revert ContractRegistry__EmptyBatch();

        _batches[batchId] =
            ContractBatch({ operatorId: operatorId, timestamp: uint64(block.timestamp), contractCount: actualCount });

        emit ContractBatchCreated(batchId, operatorId, actualCount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IContractRegistry
    function setOperatorSubmitter(address newOperatorSubmitter) external onlyOwner {
        if (newOperatorSubmitter == address(0)) revert ContractRegistry__ZeroAddress();
        address oldOperatorSubmitter = operatorSubmitter;
        operatorSubmitter = newOperatorSubmitter;
        emit OperatorSubmitterUpdated(oldOperatorSubmitter, newOperatorSubmitter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Resolve a CAIP-10 string to its `_contracts` storage key.
    ///      Handles both EVM (address-based) and non-EVM (hash-based) namespaces.
    function _resolveContractKey(string calldata caip10) internal pure returns (bytes32) {
        (bytes32 namespaceHash, bytes32 chainRef, uint256 addrStart, uint256 addrLen) = CAIP10.parse(caip10);
        bytes32 chainId = CAIP10.extractCaip2Hash(caip10);

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            address contractAddr = CAIP10Evm.parseEvmAddress(caip10, addrStart);
            return CAIP10.contractStorageKey(contractAddr, chainId);
        }

        bytes memory identifierBytes = bytes(caip10)[addrStart:addrStart + addrLen];
        bytes32 identifier = keccak256(identifierBytes);
        return CAIP10.contractKey(namespaceHash, chainRef, identifier);
    }
}

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
        // Parse CAIP-10: namespace:chainId:address
        (bytes32 namespaceHash, bytes32 chainRef, uint256 addrStart,) = CAIP10.parse(caip10);

        // Extract CAIP-2 hash directly from the string (e.g., keccak256("eip155:8453"))
        bytes32 chainId = CAIP10.extractCaip2Hash(caip10);

        // Extract address from CAIP-10 string
        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            address contractAddr = CAIP10Evm.parseEvmAddress(caip10, addrStart);
            bytes32 evmKey = CAIP10.contractStorageKey(contractAddr, chainId);
            return _contracts[evmKey].registeredAt > 0;
        }

        // For non-EVM namespaces, hash the identifier portion
        bytes memory identifierBytes = bytes(caip10)[addrStart:];
        bytes32 identifier = keccak256(identifierBytes);
        bytes32 nonEvmKey = CAIP10.contractKey(namespaceHash, chainRef, identifier);
        return _contracts[nonEvmKey].registeredAt > 0;
    }

    /// @inheritdoc IContractRegistry
    function getContractEntry(string calldata caip10) external view returns (ContractEntry memory) {
        (bytes32 namespaceHash, bytes32 chainRef, uint256 addrStart,) = CAIP10.parse(caip10);

        // Extract CAIP-2 hash directly from the string
        bytes32 chainId = CAIP10.extractCaip2Hash(caip10);

        if (namespaceHash == CAIP10.NAMESPACE_EIP155) {
            address contractAddr = CAIP10Evm.parseEvmAddress(caip10, addrStart);
            bytes32 evmKey = CAIP10.contractStorageKey(contractAddr, chainId);
            return _contracts[evmKey];
        }

        bytes memory identifierBytes = bytes(caip10)[addrStart:];
        bytes32 identifier = keccak256(identifierBytes);
        bytes32 nonEvmKey = CAIP10.contractKey(namespaceHash, chainRef, identifier);
        return _contracts[nonEvmKey];
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
        bytes32[] calldata reportedChainIds
    ) external onlyOperatorSubmitter returns (uint256 batchId) {
        uint256 length = identifiers.length;

        if (length == 0) revert ContractRegistry__EmptyBatch();
        if (length != reportedChainIds.length) revert ContractRegistry__ArrayLengthMismatch();

        // Create batch
        batchId = _nextBatchId++;
        _batches[batchId] = ContractBatch({
            operatorId: operatorId, timestamp: uint64(block.timestamp), contractCount: uint32(length)
        });

        emit ContractBatchCreated(batchId, operatorId, uint32(length));

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
                registeredAt: uint64(block.timestamp),
                reportedChainId: chainId,
                operatorId: operatorId,
                batchId: batchId
            });

            emit ContractRegistered(identifier, chainId, operatorId, batchId);
        }
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
}

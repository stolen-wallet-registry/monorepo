// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IContractRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Contract Registry - handles operator-only malicious contract registration
/// @dev Extracted from FraudRegistryHub for contract size optimization
///      NOTE: This registry is operator-only (no individual submissions) because:
///      - Contract maliciousness requires technical expertise to verify
///      - DAO-approved operators (security firms) provide trusted bulk intel
///      - Operator approval process substitutes for two-phase EIP-712 protection
interface IContractRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Data for a registered malicious contract
    /// @param registeredAt Block timestamp when contract was registered
    /// @param reportedChainId CAIP-2 chain ID hash where contract is deployed
    /// @param operatorId Operator that registered this contract
    /// @param batchId Batch ID this contract was part of
    struct ContractEntry {
        uint64 registeredAt;
        bytes32 reportedChainId;
        bytes32 operatorId;
        uint256 batchId;
    }

    /// @notice Batch registration data
    /// @param operatorId The operator who submitted this batch
    /// @param timestamp When the batch was submitted
    /// @param contractCount Number of contracts in the batch
    struct ContractBatch {
        bytes32 operatorId;
        uint64 timestamp;
        uint32 contractCount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error ContractRegistry__AlreadyRegistered();
    error ContractRegistry__ZeroAddress();
    error ContractRegistry__OnlyOperatorSubmitter();
    error ContractRegistry__EmptyBatch();
    error ContractRegistry__ArrayLengthMismatch();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a malicious contract is registered
    /// @param identifier The contract address identifier
    /// @param reportedChainId CAIP-2 chain ID hash where contract is deployed
    /// @param operatorId Operator that registered this contract
    /// @param batchId Batch ID this contract was part of
    event ContractRegistered(
        bytes32 indexed identifier, bytes32 indexed reportedChainId, bytes32 indexed operatorId, uint256 batchId
    );

    /// @notice Emitted when an operator batch is created
    /// @param batchId The batch ID
    /// @param operatorId The operator ID
    /// @param contractCount Number of contracts in the batch
    event ContractBatchCreated(uint256 indexed batchId, bytes32 indexed operatorId, uint32 contractCount);

    /// @notice Emitted when operator submitter address is updated
    event OperatorSubmitterUpdated(address oldOperatorSubmitter, address newOperatorSubmitter);

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH REGISTRATION (Operator Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register multiple malicious contracts (OperatorSubmitter only)
    /// @dev Single-phase registration - no acknowledgement required for operators
    /// @param operatorId The operator's identifier
    /// @param identifiers Array of contract address identifiers
    /// @param reportedChainIds Array of CAIP-2 chain ID hashes where contracts are deployed
    /// @return batchId The created batch ID
    function registerContractsFromOperator(
        bytes32 operatorId,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds
    ) external returns (uint256 batchId);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - CAIP-10 String Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a contract is registered using CAIP-10 string
    /// @dev Parses CAIP-10 format: "namespace:chainId:address"
    /// @param caip10 The CAIP-10 identifier (e.g., "eip155:8453:0x9fE4...")
    /// @return True if registered
    function isContractRegistered(string calldata caip10) external view returns (bool);

    /// @notice Get contract entry using CAIP-10 string
    /// @param caip10 The CAIP-10 identifier
    /// @return The contract entry data
    function getContractEntry(string calldata caip10) external view returns (ContractEntry memory);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Typed EVM Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a contract is registered (gas-efficient overload)
    /// @param contractAddress The contract address
    /// @param chainId CAIP-2 chain ID hash (e.g., keccak256("eip155:8453"))
    /// @return True if registered
    function isContractRegistered(address contractAddress, bytes32 chainId) external view returns (bool);

    /// @notice Get contract entry using address (gas-efficient overload)
    /// @param contractAddress The contract address
    /// @param chainId CAIP-2 chain ID hash
    /// @return The contract entry data
    function getContractEntry(address contractAddress, bytes32 chainId) external view returns (ContractEntry memory);

    /// @notice Get batch data
    /// @param batchId The batch ID
    /// @return The batch data
    function getContractBatch(uint256 batchId) external view returns (ContractBatch memory);

    /// @notice Get current batch count
    /// @return The number of batches created
    function contractBatchCount() external view returns (uint256);

    /// @notice Get operator submitter address
    /// @return The OperatorSubmitter address
    function operatorSubmitter() external view returns (address);

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set operator submitter address
    /// @param newOperatorSubmitter The OperatorSubmitter address
    function setOperatorSubmitter(address newOperatorSubmitter) external;
}

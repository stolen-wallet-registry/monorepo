// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOperatorSubmitter
/// @author Stolen Wallet Registry Team
/// @notice Interface for operator batch submission with pre-validation
/// @dev Separates operator logic from FraudRegistryV2 storage.
///      Operators call this contract, which validates and forwards to FraudRegistryV2.
interface IOperatorSubmitter {
    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Result of wallet batch validation
    /// @param isValid True if batch can be submitted without reverting
    /// @param isApprovedOperator True if caller has wallet capability
    /// @param requiredFee Fee in wei required for submission
    /// @param newEntryCount Number of entries that will be newly registered
    /// @param duplicateCount Number of entries already registered (will be skipped)
    /// @param isDuplicate Per-entry array: true if already registered
    /// @param errorCode Error code if invalid (0 = valid)
    struct WalletBatchValidation {
        bool isValid;
        bool isApprovedOperator;
        uint256 requiredFee;
        uint256 newEntryCount;
        uint256 duplicateCount;
        bool[] isDuplicate;
        uint8 errorCode;
    }

    /// @notice Result of transaction batch validation
    /// @param isValid True if batch can be submitted without reverting
    /// @param isApprovedOperator True if caller has transaction capability
    /// @param requiredFee Fee in wei required for submission
    /// @param newEntryCount Number of entries that will be newly registered
    /// @param duplicateCount Number of entries already registered (will be skipped)
    /// @param isDuplicate Per-entry array: true if already registered
    /// @param errorCode Error code if invalid (0 = valid)
    struct TransactionBatchValidation {
        bool isValid;
        bool isApprovedOperator;
        uint256 requiredFee;
        uint256 newEntryCount;
        uint256 duplicateCount;
        bool[] isDuplicate;
        uint8 errorCode;
    }

    /// @notice Result of contract batch validation
    /// @param isValid True if batch can be submitted without reverting
    /// @param isApprovedOperator True if caller has contract capability
    /// @param requiredFee Fee in wei required for submission
    /// @param newEntryCount Number of entries that will be newly registered
    /// @param duplicateCount Number of entries already registered (will be skipped)
    /// @param isDuplicate Per-entry array: true if already registered
    /// @param errorCode Error code if invalid (0 = valid)
    struct ContractBatchValidation {
        bool isValid;
        bool isApprovedOperator;
        uint256 requiredFee;
        uint256 newEntryCount;
        uint256 duplicateCount;
        bool[] isDuplicate;
        uint8 errorCode;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERROR CODES (for validation results)
    // ═══════════════════════════════════════════════════════════════════════════

    // 0 = Valid
    // 1 = Empty batch
    // 2 = Array length mismatch
    // 3 = Not approved operator
    // 4 = Registry paused

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when fraud registry address is updated
    /// @param fraudRegistry The new fraud registry address
    event FraudRegistrySet(address indexed fraudRegistry);

    /// @notice Emitted when operator registry address is updated
    /// @param operatorRegistry The new operator registry address
    event OperatorRegistrySet(address indexed operatorRegistry);

    /// @notice Emitted when fee manager address is updated
    /// @param feeManager The new fee manager address
    event FeeManagerSet(address indexed feeManager);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error OperatorSubmitter__NotApprovedOperator();
    error OperatorSubmitter__EmptyBatch();
    error OperatorSubmitter__ArrayLengthMismatch();
    error OperatorSubmitter__InsufficientFee();
    error OperatorSubmitter__FeeForwardFailed();
    error OperatorSubmitter__RegistryPaused();
    error OperatorSubmitter__InvalidFeeConfig();
    error OperatorSubmitter__ZeroAddress();

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Validation
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Validate wallet batch before submission (free call)
    /// @dev Call this before registerWalletsAsOperator to check for issues
    /// @param operator Address that will submit the batch
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param identifiers Array of wallet identifiers as bytes32
    /// @param reportedChainIds Array of CAIP-2 hashes where each was reported
    /// @param incidentTimestamps Array of incident timestamps
    /// @return result Validation result with per-entry duplicate info
    function validateWalletBatch(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external view returns (WalletBatchValidation memory result);

    /// @notice Validate transaction batch before submission (free call)
    /// @dev Call this before registerTransactionsAsOperator to check for issues
    /// @param operator Address that will submit the batch
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param txHashes Array of transaction hashes
    /// @return result Validation result with per-entry duplicate info
    function validateTransactionBatch(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata txHashes
    ) external view returns (TransactionBatchValidation memory result);

    /// @notice Validate contract batch before submission (free call)
    /// @dev Call this before registerContractsAsOperator to check for issues
    /// @param operator Address that will submit the batch
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param contractIds Array of contract identifiers as bytes32
    /// @return result Validation result with per-entry duplicate info
    function validateContractBatch(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata contractIds
    ) external view returns (ContractBatchValidation memory result);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Configuration
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the fraud registry address
    /// @return The fraud registry contract address
    function fraudRegistry() external view returns (address);

    /// @notice Get the operator registry address
    /// @return The operator registry contract address
    function operatorRegistry() external view returns (address);

    /// @notice Get the fee manager address
    /// @return The fee manager contract address (address(0) = free)
    function feeManager() external view returns (address);

    /// @notice Quote the fee for an operator batch submission
    /// @return fee Fee in wei (0 if no fee manager)
    function quoteBatchFee() external view returns (uint256 fee);

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Operator Batch Submission
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register batch of wallets as operator
    /// @dev Validates operator permission, collects fee, forwards to FraudRegistryV2
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param identifiers Array of wallet identifiers as bytes32
    /// @param reportedChainIds Array of CAIP-2 hashes where each was reported
    /// @param incidentTimestamps Array of incident timestamps
    function registerWalletsAsOperator(
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external payable;

    /// @notice Register batch of transactions as operator
    /// @dev Validates operator permission, collects fee, forwards to FraudRegistryV2
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param txHashes Array of transaction hashes
    function registerTransactionsAsOperator(
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata txHashes
    ) external payable;

    /// @notice Register batch of contracts as operator
    /// @dev Validates operator permission, collects fee, forwards to FraudRegistryV2
    /// @param namespaceHashes Array of namespace hashes
    /// @param chainRefs Array of chain reference hashes
    /// @param contractIds Array of contract identifiers as bytes32
    function registerContractsAsOperator(
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata contractIds
    ) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set the fraud registry address
    /// @param _fraudRegistry The new fraud registry address
    function setFraudRegistry(address _fraudRegistry) external;

    /// @notice Set the operator registry address
    /// @param _operatorRegistry The new operator registry address
    function setOperatorRegistry(address _operatorRegistry) external;

    /// @notice Set the fee manager address
    /// @param _feeManager The new fee manager address
    function setFeeManager(address _feeManager) external;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { IOperatorSubmitter } from "./interfaces/IOperatorSubmitter.sol";
import { IFraudRegistryV2 } from "./interfaces/IFraudRegistryV2.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { RegistryCapabilities } from "../libraries/RegistryCapabilities.sol";
import { CAIP10 } from "./libraries/CAIP10.sol";

/// @title OperatorSubmitter
/// @author Stolen Wallet Registry Team
/// @notice Handles operator batch submissions with validation
/// @dev Separates operator logic from FraudRegistryV2 storage.
///      Operators call this contract, which:
///      1. Validates operator permissions via OperatorRegistry
///      2. Collects fees via FeeManager
///      3. Forwards validated data to FraudRegistryV2
contract OperatorSubmitter is IOperatorSubmitter, Ownable2Step, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    uint8 private constant WALLET_CAPABILITY = RegistryCapabilities.WALLET_REGISTRY;
    uint8 private constant TX_CAPABILITY = RegistryCapabilities.TX_REGISTRY;
    uint8 private constant CONTRACT_CAPABILITY = RegistryCapabilities.CONTRACT_REGISTRY;

    // Error codes for validation
    uint8 private constant ERROR_NONE = 0;
    uint8 private constant ERROR_EMPTY_BATCH = 1;
    uint8 private constant ERROR_ARRAY_LENGTH_MISMATCH = 2;
    uint8 private constant ERROR_NOT_APPROVED_OPERATOR = 3;
    uint8 private constant ERROR_REGISTRY_PAUSED = 4;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice FraudRegistryV2 contract address
    address public fraudRegistry;

    /// @notice OperatorRegistry contract address
    address public operatorRegistry;

    /// @notice FeeManager contract address (address(0) = free)
    address public feeManager;

    /// @notice Fee recipient address
    address public feeRecipient;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the operator submitter
    /// @param _owner Initial owner
    /// @param _fraudRegistry FraudRegistryV2 contract address
    /// @param _operatorRegistry OperatorRegistry contract address
    /// @param _feeManager FeeManager contract address (address(0) for free)
    /// @param _feeRecipient Where fees go
    constructor(
        address _owner,
        address _fraudRegistry,
        address _operatorRegistry,
        address _feeManager,
        address _feeRecipient
    ) Ownable(_owner) {
        // If feeManager is set, feeRecipient must also be set to avoid locked ETH
        if (_feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
        }
        fraudRegistry = _fraudRegistry;
        operatorRegistry = _operatorRegistry;
        feeManager = _feeManager;
        feeRecipient = _feeRecipient;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Require caller is approved operator for capability
    modifier onlyApprovedOperator(uint8 capability) {
        if (operatorRegistry == address(0)) revert OperatorSubmitter__NotApprovedOperator();
        if (!IOperatorRegistry(operatorRegistry).isApprovedFor(msg.sender, capability)) {
            revert OperatorSubmitter__NotApprovedOperator();
        }
        _;
    }

    /// @dev Require fraud registry is not paused
    modifier whenRegistryNotPaused() {
        if (fraudRegistry == address(0)) revert OperatorSubmitter__RegistryPaused();
        if (Pausable(fraudRegistry).paused()) revert OperatorSubmitter__RegistryPaused();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Check if operator is approved for capability (for validation views)
    function _isApprovedOperator(address operator, uint8 capability) internal view returns (bool) {
        if (operatorRegistry == address(0)) return false;
        return IOperatorRegistry(operatorRegistry).isApprovedFor(operator, capability);
    }

    /// @dev Check if registry is paused (for validation views)
    function _isRegistryPaused() internal view returns (bool) {
        if (fraudRegistry == address(0)) return true;
        return Pausable(fraudRegistry).paused();
    }

    /// @dev Get batch fee quote
    function _getBatchFee() internal view returns (uint256) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).operatorBatchFeeWei();
    }

    /// @dev Collect and forward fee
    function _collectFee() internal {
        if (feeManager == address(0)) return;

        uint256 requiredFee = IFeeManager(feeManager).operatorBatchFeeWei();
        if (msg.value < requiredFee) {
            revert OperatorSubmitter__InsufficientFee();
        }

        if (feeRecipient != address(0) && msg.value > 0) {
            (bool success,) = feeRecipient.call{ value: msg.value }("");
            if (!success) {
                revert OperatorSubmitter__FeeForwardFailed();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Validation
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IOperatorSubmitter
    function validateWalletBatch(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external view returns (WalletBatchValidation memory result) {
        uint256 length = namespaceHashes.length;

        // Check empty batch
        if (length == 0) {
            result.errorCode = ERROR_EMPTY_BATCH;
            return result;
        }

        // Check array lengths
        if (
            length != chainRefs.length || length != identifiers.length || length != reportedChainIds.length
                || length != incidentTimestamps.length
        ) {
            result.errorCode = ERROR_ARRAY_LENGTH_MISMATCH;
            return result;
        }

        // Check operator permission
        result.isApprovedOperator = _isApprovedOperator(operator, WALLET_CAPABILITY);
        if (!result.isApprovedOperator) {
            result.errorCode = ERROR_NOT_APPROVED_OPERATOR;
            return result;
        }

        // Check registry paused
        if (_isRegistryPaused()) {
            result.errorCode = ERROR_REGISTRY_PAUSED;
            return result;
        }

        // Check each entry for duplicates
        result.isDuplicate = new bool[](length);
        for (uint256 i = 0; i < length; i++) {
            if (identifiers[i] == bytes32(0)) {
                result.isDuplicate[i] = true; // Treat zero as "skip"
                result.duplicateCount++;
                continue;
            }

            // Check if already registered
            bool registered;
            if (namespaceHashes[i] == CAIP10.NAMESPACE_EIP155) {
                address wallet = address(uint160(uint256(identifiers[i])));
                registered = IFraudRegistryV2(fraudRegistry).isRegistered(wallet);
            } else {
                // For non-EVM, use CAIP-10 string check (simplified)
                registered = false; // TODO: implement for non-EVM when supported
            }

            if (registered) {
                result.isDuplicate[i] = true;
                result.duplicateCount++;
            }
        }

        result.newEntryCount = length - result.duplicateCount;
        result.requiredFee = _getBatchFee();
        result.isValid = true;
        result.errorCode = ERROR_NONE;
    }

    /// @inheritdoc IOperatorSubmitter
    function validateTransactionBatch(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata txHashes
    ) external view returns (TransactionBatchValidation memory result) {
        uint256 length = txHashes.length;

        // Check empty batch
        if (length == 0) {
            result.errorCode = ERROR_EMPTY_BATCH;
            return result;
        }

        // Check array lengths
        if (length != namespaceHashes.length || length != chainRefs.length) {
            result.errorCode = ERROR_ARRAY_LENGTH_MISMATCH;
            return result;
        }

        // Check operator permission
        result.isApprovedOperator = _isApprovedOperator(operator, TX_CAPABILITY);
        if (!result.isApprovedOperator) {
            result.errorCode = ERROR_NOT_APPROVED_OPERATOR;
            return result;
        }

        // Check registry paused
        if (_isRegistryPaused()) {
            result.errorCode = ERROR_REGISTRY_PAUSED;
            return result;
        }

        // Check each entry for duplicates
        result.isDuplicate = new bool[](length);
        for (uint256 i = 0; i < length; i++) {
            if (txHashes[i] == bytes32(0)) {
                result.isDuplicate[i] = true;
                result.duplicateCount++;
                continue;
            }

            // Compute chain ID for lookup
            bytes32 chainId = keccak256(abi.encodePacked(namespaceHashes[i], chainRefs[i]));
            bool registered = IFraudRegistryV2(fraudRegistry).isTransactionRegistered(txHashes[i], chainId);

            if (registered) {
                result.isDuplicate[i] = true;
                result.duplicateCount++;
            }
        }

        result.newEntryCount = length - result.duplicateCount;
        result.requiredFee = _getBatchFee();
        result.isValid = true;
        result.errorCode = ERROR_NONE;
    }

    /// @inheritdoc IOperatorSubmitter
    function validateContractBatch(
        address operator,
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata contractIds
    ) external view returns (ContractBatchValidation memory result) {
        uint256 length = contractIds.length;

        // Check empty batch
        if (length == 0) {
            result.errorCode = ERROR_EMPTY_BATCH;
            return result;
        }

        // Check array lengths
        if (length != namespaceHashes.length || length != chainRefs.length) {
            result.errorCode = ERROR_ARRAY_LENGTH_MISMATCH;
            return result;
        }

        // Check operator permission
        result.isApprovedOperator = _isApprovedOperator(operator, CONTRACT_CAPABILITY);
        if (!result.isApprovedOperator) {
            result.errorCode = ERROR_NOT_APPROVED_OPERATOR;
            return result;
        }

        // Check registry paused
        if (_isRegistryPaused()) {
            result.errorCode = ERROR_REGISTRY_PAUSED;
            return result;
        }

        // Check each entry for duplicates
        result.isDuplicate = new bool[](length);
        for (uint256 i = 0; i < length; i++) {
            if (contractIds[i] == bytes32(0)) {
                result.isDuplicate[i] = true;
                result.duplicateCount++;
                continue;
            }

            // Compute chain ID for lookup
            bytes32 chainId = keccak256(abi.encodePacked(namespaceHashes[i], chainRefs[i]));
            address contractAddr = address(uint160(uint256(contractIds[i])));
            bool registered = IFraudRegistryV2(fraudRegistry).isContractRegistered(contractAddr, chainId);

            if (registered) {
                result.isDuplicate[i] = true;
                result.duplicateCount++;
            }
        }

        result.newEntryCount = length - result.duplicateCount;
        result.requiredFee = _getBatchFee();
        result.isValid = true;
        result.errorCode = ERROR_NONE;
    }

    /// @inheritdoc IOperatorSubmitter
    function quoteBatchFee() external view returns (uint256 fee) {
        return _getBatchFee();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Operator Batch Submission
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IOperatorSubmitter
    function registerWalletsAsOperator(
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external payable whenNotPaused onlyApprovedOperator(WALLET_CAPABILITY) whenRegistryNotPaused {
        // Validate arrays
        uint256 length = namespaceHashes.length;
        if (length == 0) revert OperatorSubmitter__EmptyBatch();
        if (
            length != chainRefs.length || length != identifiers.length || length != reportedChainIds.length
                || length != incidentTimestamps.length
        ) {
            revert OperatorSubmitter__ArrayLengthMismatch();
        }

        // Collect fee
        _collectFee();

        // Forward to FraudRegistryV2
        IFraudRegistryV2(fraudRegistry)
            .registerWalletsFromOperator(
                msg.sender, namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
            );
    }

    /// @inheritdoc IOperatorSubmitter
    function registerTransactionsAsOperator(
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata txHashes
    ) external payable whenNotPaused onlyApprovedOperator(TX_CAPABILITY) whenRegistryNotPaused {
        // Validate arrays
        uint256 length = txHashes.length;
        if (length == 0) revert OperatorSubmitter__EmptyBatch();
        if (length != namespaceHashes.length || length != chainRefs.length) {
            revert OperatorSubmitter__ArrayLengthMismatch();
        }

        // Collect fee
        _collectFee();

        // Forward to FraudRegistryV2
        IFraudRegistryV2(fraudRegistry)
            .registerTransactionsFromOperator(msg.sender, namespaceHashes, chainRefs, txHashes);
    }

    /// @inheritdoc IOperatorSubmitter
    function registerContractsAsOperator(
        bytes32[] calldata namespaceHashes,
        bytes32[] calldata chainRefs,
        bytes32[] calldata contractIds
    ) external payable whenNotPaused onlyApprovedOperator(CONTRACT_CAPABILITY) whenRegistryNotPaused {
        // Validate arrays
        uint256 length = contractIds.length;
        if (length == 0) revert OperatorSubmitter__EmptyBatch();
        if (length != namespaceHashes.length || length != chainRefs.length) {
            revert OperatorSubmitter__ArrayLengthMismatch();
        }

        // Collect fee
        _collectFee();

        // Forward to FraudRegistryV2
        IFraudRegistryV2(fraudRegistry)
            .registerContractsFromOperator(msg.sender, namespaceHashes, chainRefs, contractIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IOperatorSubmitter
    function setFraudRegistry(address _fraudRegistry) external onlyOwner {
        fraudRegistry = _fraudRegistry;
        emit FraudRegistrySet(_fraudRegistry);
    }

    /// @inheritdoc IOperatorSubmitter
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner {
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    /// @inheritdoc IOperatorSubmitter
    function setFeeManager(address _feeManager) external onlyOwner {
        // If enabling fees, feeRecipient must be set
        if (_feeManager != address(0) && feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
        }
        feeManager = _feeManager;
        emit FeeManagerSet(_feeManager);
    }

    /// @notice Set fee recipient address
    /// @param _feeRecipient Where fees go
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        // If feeManager is set, feeRecipient cannot be cleared
        if (feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
        }
        feeRecipient = _feeRecipient;
    }

    /// @notice Pause the contract
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}

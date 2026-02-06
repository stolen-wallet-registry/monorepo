// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { IWalletRegistryV2 } from "./interfaces/IWalletRegistryV2.sol";
import { ITransactionRegistryV2 } from "./interfaces/ITransactionRegistryV2.sol";
import { IContractRegistryV2 } from "./interfaces/IContractRegistryV2.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { RegistryCapabilities } from "../libraries/RegistryCapabilities.sol";

/// @title OperatorSubmitterV2
/// @author Stolen Wallet Registry Team
/// @notice Handles operator batch submissions to separate registries
/// @dev Updated to work with the Hub + Separate Registries architecture.
///      Operators call this contract, which:
///      1. Validates operator permissions via OperatorRegistry
///      2. Collects fees via FeeManager
///      3. Forwards validated data to appropriate registry
contract OperatorSubmitterV2 is Ownable2Step, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    uint8 private constant WALLET_CAPABILITY = RegistryCapabilities.WALLET_REGISTRY;
    uint8 private constant TX_CAPABILITY = RegistryCapabilities.TX_REGISTRY;
    uint8 private constant CONTRACT_CAPABILITY = RegistryCapabilities.CONTRACT_REGISTRY;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error OperatorSubmitterV2__ZeroAddress();
    error OperatorSubmitterV2__NotApprovedOperator();
    error OperatorSubmitterV2__EmptyBatch();
    error OperatorSubmitterV2__ArrayLengthMismatch();
    error OperatorSubmitterV2__InsufficientFee();
    error OperatorSubmitterV2__FeeForwardFailed();
    error OperatorSubmitterV2__InvalidFeeConfig();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when wallet registry address is updated
    /// @param walletRegistry The new wallet registry address
    event WalletRegistrySet(address indexed walletRegistry);

    /// @notice Emitted when transaction registry address is updated
    /// @param transactionRegistry The new transaction registry address
    event TransactionRegistrySet(address indexed transactionRegistry);

    /// @notice Emitted when contract registry address is updated
    /// @param contractRegistry The new contract registry address
    event ContractRegistrySet(address indexed contractRegistry);

    /// @notice Emitted when operator registry address is updated
    /// @param operatorRegistry The new operator registry address
    event OperatorRegistrySet(address indexed operatorRegistry);

    /// @notice Emitted when fee manager address is updated
    /// @param feeManager The new fee manager address
    event FeeManagerSet(address indexed feeManager);

    /// @notice Emitted when fee recipient address is updated
    /// @param feeRecipient The new fee recipient address
    event FeeRecipientSet(address indexed feeRecipient);

    /// @notice Emitted when an operator batch is submitted to a registry
    event BatchSubmitted(address indexed operator, address indexed registry, uint256 batchId, uint32 entryCount);

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet registry contract
    address public walletRegistry;

    /// @notice Transaction registry contract
    address public transactionRegistry;

    /// @notice Contract registry contract
    address public contractRegistry;

    /// @notice OperatorRegistry contract
    address public operatorRegistry;

    /// @notice FeeManager contract (address(0) = free)
    address public feeManager;

    /// @notice Fee recipient address
    address public feeRecipient;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the operator submitter
    /// @param _owner Initial owner
    /// @param _walletRegistry WalletRegistryV2 contract
    /// @param _transactionRegistry TransactionRegistryV2 contract
    /// @param _contractRegistry ContractRegistryV2 contract
    /// @param _operatorRegistry OperatorRegistry contract
    /// @param _feeManager FeeManager contract (address(0) for free)
    /// @param _feeRecipient Where fees go
    constructor(
        address _owner,
        address _walletRegistry,
        address _transactionRegistry,
        address _contractRegistry,
        address _operatorRegistry,
        address _feeManager,
        address _feeRecipient
    ) Ownable(_owner) {
        if (_owner == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        if (_walletRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        if (_transactionRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        if (_contractRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        if (_operatorRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();

        // If feeManager is set, feeRecipient must also be set
        if (_feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitterV2__InvalidFeeConfig();
        }

        walletRegistry = _walletRegistry;
        transactionRegistry = _transactionRegistry;
        contractRegistry = _contractRegistry;
        operatorRegistry = _operatorRegistry;
        feeManager = _feeManager;
        feeRecipient = _feeRecipient;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyApprovedOperator(uint8 capability) {
        if (operatorRegistry == address(0)) revert OperatorSubmitterV2__NotApprovedOperator();
        if (!IOperatorRegistry(operatorRegistry).isApprovedFor(msg.sender, capability)) {
            revert OperatorSubmitterV2__NotApprovedOperator();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getBatchFee() internal view returns (uint256) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).operatorBatchFeeWei();
    }

    function _collectFee() internal {
        if (feeManager == address(0)) return;

        uint256 requiredFee = IFeeManager(feeManager).operatorBatchFeeWei();
        if (msg.value < requiredFee) {
            revert OperatorSubmitterV2__InsufficientFee();
        }

        if (feeRecipient != address(0) && msg.value > 0) {
            (bool success,) = feeRecipient.call{ value: msg.value }("");
            if (!success) {
                revert OperatorSubmitterV2__FeeForwardFailed();
            }
        }
    }

    /// @notice Get operator ID from address
    /// @dev Converts msg.sender to bytes32 operator ID
    /// @return The operator ID as bytes32 (address padded to 32 bytes)
    function _getOperatorId() internal view returns (bytes32) {
        return bytes32(uint256(uint160(msg.sender)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Quote fee for a batch submission
    /// @return fee The required fee in wei for a batch submission
    function quoteBatchFee() external view returns (uint256 fee) {
        return _getBatchFee();
    }

    /// @notice Check if an operator is approved for a capability
    /// @param operator The operator address to check
    /// @param capability The capability to check (use RegistryCapabilities constants)
    /// @return True if the operator is approved for the capability
    function isApprovedOperator(address operator, uint8 capability) external view returns (bool) {
        if (operatorRegistry == address(0)) return false;
        return IOperatorRegistry(operatorRegistry).isApprovedFor(operator, capability);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS - Operator Batch Submission
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register wallets as an approved operator
    /// @param identifiers Array of wallet identifiers (address as bytes32)
    /// @param reportedChainIds Array of CAIP-2 chain ID hashes
    /// @param incidentTimestamps Array of incident timestamps
    function registerWalletsAsOperator(
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint64[] calldata incidentTimestamps
    ) external payable whenNotPaused onlyApprovedOperator(WALLET_CAPABILITY) {
        uint256 length = identifiers.length;
        if (length == 0) revert OperatorSubmitterV2__EmptyBatch();
        if (length != reportedChainIds.length || length != incidentTimestamps.length) {
            revert OperatorSubmitterV2__ArrayLengthMismatch();
        }

        _collectFee();

        uint256 batchId = IWalletRegistryV2(walletRegistry)
            .registerWalletsFromOperator(_getOperatorId(), identifiers, reportedChainIds, incidentTimestamps);

        emit BatchSubmitted(msg.sender, walletRegistry, batchId, uint32(length));
    }

    /// @notice Register transactions as an approved operator
    /// @param transactionHashes Array of transaction hashes
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    function registerTransactionsAsOperator(bytes32[] calldata transactionHashes, bytes32[] calldata chainIds)
        external
        payable
        whenNotPaused
        onlyApprovedOperator(TX_CAPABILITY)
    {
        uint256 length = transactionHashes.length;
        if (length == 0) revert OperatorSubmitterV2__EmptyBatch();
        if (length != chainIds.length) {
            revert OperatorSubmitterV2__ArrayLengthMismatch();
        }

        _collectFee();

        uint256 batchId = ITransactionRegistryV2(transactionRegistry)
            .registerTransactionsFromOperator(_getOperatorId(), transactionHashes, chainIds);

        emit BatchSubmitted(msg.sender, transactionRegistry, batchId, uint32(length));
    }

    /// @notice Register malicious contracts as an approved operator
    /// @param identifiers Array of contract identifiers (address as bytes32)
    /// @param reportedChainIds Array of CAIP-2 chain ID hashes
    function registerContractsAsOperator(bytes32[] calldata identifiers, bytes32[] calldata reportedChainIds)
        external
        payable
        whenNotPaused
        onlyApprovedOperator(CONTRACT_CAPABILITY)
    {
        uint256 length = identifiers.length;
        if (length == 0) revert OperatorSubmitterV2__EmptyBatch();
        if (length != reportedChainIds.length) {
            revert OperatorSubmitterV2__ArrayLengthMismatch();
        }

        _collectFee();

        uint256 batchId = IContractRegistryV2(contractRegistry)
            .registerContractsFromOperator(_getOperatorId(), identifiers, reportedChainIds);

        emit BatchSubmitted(msg.sender, contractRegistry, batchId, uint32(length));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set wallet registry address
    /// @param _walletRegistry The new wallet registry address
    function setWalletRegistry(address _walletRegistry) external onlyOwner {
        if (_walletRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        walletRegistry = _walletRegistry;
        emit WalletRegistrySet(_walletRegistry);
    }

    /// @notice Set transaction registry address
    /// @param _transactionRegistry The new transaction registry address
    function setTransactionRegistry(address _transactionRegistry) external onlyOwner {
        if (_transactionRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        transactionRegistry = _transactionRegistry;
        emit TransactionRegistrySet(_transactionRegistry);
    }

    /// @notice Set contract registry address
    /// @param _contractRegistry The new contract registry address
    function setContractRegistry(address _contractRegistry) external onlyOwner {
        if (_contractRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        contractRegistry = _contractRegistry;
        emit ContractRegistrySet(_contractRegistry);
    }

    /// @notice Set operator registry address
    /// @param _operatorRegistry The new operator registry address
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner {
        if (_operatorRegistry == address(0)) revert OperatorSubmitterV2__ZeroAddress();
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    /// @notice Set fee manager address
    /// @dev If setting both feeManager and feeRecipient from scratch, use setFeeConfig() instead.
    ///      Order constraint: feeRecipient must be set before feeManager (cannot enable fees without a recipient).
    /// @param _feeManager The new fee manager address (address(0) for free)
    function setFeeManager(address _feeManager) external onlyOwner {
        if (_feeManager != address(0) && feeRecipient == address(0)) {
            revert OperatorSubmitterV2__InvalidFeeConfig();
        }
        feeManager = _feeManager;
        emit FeeManagerSet(_feeManager);
    }

    /// @notice Set fee recipient address
    /// @param _feeRecipient The new fee recipient address
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitterV2__InvalidFeeConfig();
        }
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    /// @notice Set both fee manager and fee recipient atomically
    /// @dev Avoids ordering issues when configuring fees from scratch.
    ///      To disable fees, pass address(0) for both.
    /// @param _feeManager The fee manager address (address(0) to disable)
    /// @param _feeRecipient The fee recipient address
    function setFeeConfig(address _feeManager, address _feeRecipient) external onlyOwner {
        if (_feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitterV2__InvalidFeeConfig();
        }
        feeManager = _feeManager;
        feeRecipient = _feeRecipient;
        emit FeeManagerSet(_feeManager);
        emit FeeRecipientSet(_feeRecipient);
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

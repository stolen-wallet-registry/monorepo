// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TimelockOwnable } from "./libraries/TimelockOwnable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IWalletRegistry } from "./interfaces/IWalletRegistry.sol";
import { ITransactionRegistry } from "./interfaces/ITransactionRegistry.sol";
import { IContractRegistry } from "./interfaces/IContractRegistry.sol";
import { IOperatorRegistry } from "./interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "./interfaces/IFeeManager.sol";
import { RegistryCapabilities } from "./libraries/RegistryCapabilities.sol";

/// @title OperatorSubmitter
/// @author Stolen Wallet Registry Team
/// @notice Handles operator batch submissions to separate registries
/// @dev Updated to work with the Hub + Separate Registries architecture.
///      Operators call this contract, which:
///      1. Validates operator permissions via OperatorRegistry
///      2. Collects fees via FeeManager
///      3. Forwards validated data to appropriate registry
contract OperatorSubmitter is TimelockOwnable, Pausable, ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    // solhint-disable-next-line private-vars-leading-underscore
    uint8 private constant WALLET_CAPABILITY = RegistryCapabilities.WALLET_REGISTRY;
    // solhint-disable-next-line private-vars-leading-underscore
    uint8 private constant TX_CAPABILITY = RegistryCapabilities.TX_REGISTRY;
    // solhint-disable-next-line private-vars-leading-underscore
    uint8 private constant CONTRACT_CAPABILITY = RegistryCapabilities.CONTRACT_REGISTRY;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error OperatorSubmitter__ZeroAddress();
    error OperatorSubmitter__NotApprovedOperator();
    error OperatorSubmitter__EmptyBatch();
    error OperatorSubmitter__ArrayLengthMismatch();
    error OperatorSubmitter__InsufficientFee();
    error OperatorSubmitter__FeeForwardFailed();
    error OperatorSubmitter__RefundFailed();
    error OperatorSubmitter__InvalidFeeConfig();

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
    /// @param operator The operator address that submitted the batch
    /// @param registry The registry contract the batch was submitted to
    /// @param batchId The ID assigned to this batch
    /// @param entryCount The number of entries in the batch
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
    /// @param _walletRegistry WalletRegistry contract
    /// @param _transactionRegistry TransactionRegistry contract
    /// @param _contractRegistry ContractRegistry contract
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
        if (_owner == address(0)) revert OperatorSubmitter__ZeroAddress();
        if (_walletRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        if (_transactionRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        if (_contractRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        if (_operatorRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();

        // If feeManager is set, feeRecipient must also be set
        if (_feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
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
        if (operatorRegistry == address(0)) revert OperatorSubmitter__NotApprovedOperator();
        if (!IOperatorRegistry(operatorRegistry).isApprovedFor(msg.sender, capability)) {
            revert OperatorSubmitter__NotApprovedOperator();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Operator batch fees are free by default: `FeeManager.operatorBatchFeeUsdCents`
    ///      ships as 0, so this returns 0 unless the DAO explicitly enables a fee. See the
    ///      rationale on that field, and PRPs/operator-fee-removal.md.
    ///
    ///      Note the fee is NOT disabled by leaving `feeManager` unset — the deploy scripts
    ///      always wire a real FeeManager. The zero default is what makes batches free, and
    ///      the mechanism here stays live so a future fee needs no redeployment.
    ///
    ///      Callers must quote via {quoteBatchFee} and send that amount. Quoting
    ///      `FeeManager.currentFeeWei()` (the per-REGISTRATION fee charged to individuals) is
    ///      a different, unrelated price and will under-fund the call whenever a batch fee is
    ///      enabled, reverting with OperatorSubmitter__InsufficientFee.
    function _getBatchFee() internal view returns (uint256) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).operatorBatchFeeWei();
    }

    function _collectFee() internal {
        uint256 requiredFee = _getBatchFee();

        if (msg.value < requiredFee) {
            revert OperatorSubmitter__InsufficientFee();
        }

        if (requiredFee > 0) {
            if (feeRecipient == address(0)) revert OperatorSubmitter__InvalidFeeConfig();
            (bool success,) = feeRecipient.call{ value: requiredFee }("");
            if (!success) {
                revert OperatorSubmitter__FeeForwardFailed();
            }
        }

        // Push-based refund: operators must be able to receive ETH.
        // If a smart-contract operator cannot accept refunds, the tx reverts —
        // this is intentional. Operators should call quoteBatchFee() and send
        // the exact amount. The contract must remain sweep-able to treasury
        // without accounting for pending balances.
        uint256 excess = msg.value - requiredFee;
        if (excess > 0) {
            (bool refundSuccess,) = msg.sender.call{ value: excess }("");
            if (!refundSuccess) {
                revert OperatorSubmitter__RefundFailed();
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
    ) external payable nonReentrant whenNotPaused onlyApprovedOperator(WALLET_CAPABILITY) {
        uint256 length = identifiers.length;
        if (length == 0) revert OperatorSubmitter__EmptyBatch();
        if (length != reportedChainIds.length || length != incidentTimestamps.length) {
            revert OperatorSubmitter__ArrayLengthMismatch();
        }

        _collectFee();

        uint256 batchId = IWalletRegistry(walletRegistry)
            .registerWalletsFromOperator(_getOperatorId(), identifiers, reportedChainIds, incidentTimestamps);

        emit BatchSubmitted(msg.sender, walletRegistry, batchId, uint32(length));
    }

    /// @notice Register transactions as an approved operator
    /// @param transactionHashes Array of transaction hashes
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    function registerTransactionsAsOperator(bytes32[] calldata transactionHashes, bytes32[] calldata chainIds)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyApprovedOperator(TX_CAPABILITY)
    {
        uint256 length = transactionHashes.length;
        if (length == 0) revert OperatorSubmitter__EmptyBatch();
        if (length != chainIds.length) {
            revert OperatorSubmitter__ArrayLengthMismatch();
        }

        _collectFee();

        uint256 batchId = ITransactionRegistry(transactionRegistry)
            .registerTransactionsFromOperator(_getOperatorId(), transactionHashes, chainIds);

        emit BatchSubmitted(msg.sender, transactionRegistry, batchId, uint32(length));
    }

    /// @notice Register malicious contracts as an approved operator
    /// @param identifiers Array of contract identifiers (address as bytes32)
    /// @param reportedChainIds Array of CAIP-2 chain ID hashes
    /// @param threatCategories Array of threat category values (0=unclassified, 1-5=defined, 6-255=future)
    function registerContractsAsOperator(
        bytes32[] calldata identifiers,
        bytes32[] calldata reportedChainIds,
        uint8[] calldata threatCategories
    ) external payable nonReentrant whenNotPaused onlyApprovedOperator(CONTRACT_CAPABILITY) {
        uint256 length = identifiers.length;
        if (length == 0) revert OperatorSubmitter__EmptyBatch();
        if (length != reportedChainIds.length || length != threatCategories.length) {
            revert OperatorSubmitter__ArrayLengthMismatch();
        }

        _collectFee();

        uint256 batchId = IContractRegistry(contractRegistry)
            .registerContractsFromOperator(_getOperatorId(), identifiers, reportedChainIds, threatCategories);

        emit BatchSubmitted(msg.sender, contractRegistry, batchId, uint32(length));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set wallet registry address
    /// @dev Immediate during initial setup, timelocked after completeSetup(). Repointing a
    ///      registry silently redirects every operator batch: submissions appear to succeed,
    ///      land nowhere the indexer reads, and nobody gets a delay in which to notice.
    /// @param _walletRegistry The new wallet registry address
    function setWalletRegistry(address _walletRegistry) external onlyOwner onlyDuringSetup {
        if (_walletRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _setWalletRegistry(_walletRegistry);
    }

    /// @notice Propose a wallet registry change (2-day delay before activation)
    /// @param _walletRegistry The new wallet registry address
    function proposeWalletRegistry(address _walletRegistry) external onlyOwner {
        if (_walletRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _proposeAction(keccak256(abi.encode("setWalletRegistry", _walletRegistry)));
    }

    /// @notice Activate a previously proposed wallet registry change
    /// @param _walletRegistry The new wallet registry address
    function activateWalletRegistry(address _walletRegistry) external onlyOwner {
        _activateAction(keccak256(abi.encode("setWalletRegistry", _walletRegistry)));
        _setWalletRegistry(_walletRegistry);
    }

    /// @notice Set transaction registry address
    /// @dev Immediate during initial setup, timelocked after completeSetup() — see
    ///      {setWalletRegistry} for the rationale.
    /// @param _transactionRegistry The new transaction registry address
    function setTransactionRegistry(address _transactionRegistry) external onlyOwner onlyDuringSetup {
        if (_transactionRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _setTransactionRegistry(_transactionRegistry);
    }

    /// @notice Propose a transaction registry change (2-day delay before activation)
    /// @param _transactionRegistry The new transaction registry address
    function proposeTransactionRegistry(address _transactionRegistry) external onlyOwner {
        if (_transactionRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _proposeAction(keccak256(abi.encode("setTransactionRegistry", _transactionRegistry)));
    }

    /// @notice Activate a previously proposed transaction registry change
    /// @param _transactionRegistry The new transaction registry address
    function activateTransactionRegistry(address _transactionRegistry) external onlyOwner {
        _activateAction(keccak256(abi.encode("setTransactionRegistry", _transactionRegistry)));
        _setTransactionRegistry(_transactionRegistry);
    }

    /// @notice Set contract registry address
    /// @dev Immediate during initial setup, timelocked after completeSetup() — see
    ///      {setWalletRegistry} for the rationale.
    /// @param _contractRegistry The new contract registry address
    function setContractRegistry(address _contractRegistry) external onlyOwner onlyDuringSetup {
        if (_contractRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _setContractRegistry(_contractRegistry);
    }

    /// @notice Propose a contract registry change (2-day delay before activation)
    /// @param _contractRegistry The new contract registry address
    function proposeContractRegistry(address _contractRegistry) external onlyOwner {
        if (_contractRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _proposeAction(keccak256(abi.encode("setContractRegistry", _contractRegistry)));
    }

    /// @notice Activate a previously proposed contract registry change
    /// @param _contractRegistry The new contract registry address
    function activateContractRegistry(address _contractRegistry) external onlyOwner {
        _activateAction(keccak256(abi.encode("setContractRegistry", _contractRegistry)));
        _setContractRegistry(_contractRegistry);
    }

    function _setWalletRegistry(address _walletRegistry) internal {
        walletRegistry = _walletRegistry;
        emit WalletRegistrySet(_walletRegistry);
    }

    function _setTransactionRegistry(address _transactionRegistry) internal {
        transactionRegistry = _transactionRegistry;
        emit TransactionRegistrySet(_transactionRegistry);
    }

    function _setContractRegistry(address _contractRegistry) internal {
        contractRegistry = _contractRegistry;
        emit ContractRegistrySet(_contractRegistry);
    }

    /// @notice Set operator registry address
    /// @dev Immediate during initial setup, timelocked after completeSetup().
    ///      The operator registry decides who may submit batches, so swapping it is a
    ///      trust-boundary change — post-setup it goes through propose → 2 days → activate.
    /// @param _operatorRegistry The new operator registry address
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner onlyDuringSetup {
        if (_operatorRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _setOperatorRegistry(_operatorRegistry);
    }

    /// @notice Propose an operator registry change (2-day delay before activation)
    /// @param _operatorRegistry The new operator registry address
    function proposeOperatorRegistry(address _operatorRegistry) external onlyOwner {
        if (_operatorRegistry == address(0)) revert OperatorSubmitter__ZeroAddress();
        _proposeAction(keccak256(abi.encode("setOperatorRegistry", _operatorRegistry)));
    }

    /// @notice Activate a previously proposed operator registry change
    /// @param _operatorRegistry The new operator registry address
    function activateOperatorRegistry(address _operatorRegistry) external onlyOwner {
        _activateAction(keccak256(abi.encode("setOperatorRegistry", _operatorRegistry)));
        _setOperatorRegistry(_operatorRegistry);
    }

    function _setOperatorRegistry(address _operatorRegistry) internal {
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    /// @notice Set fee manager address
    /// @dev Immediate during initial setup, timelocked after completeSetup(). The fee pointers
    ///      are the one set of state on this contract that moves MONEY rather than data:
    ///      {_collectFee} pushes the collected fee straight to `feeRecipient`, so `feeRecipient`
    ///      IS the money and `feeManager` sets how much of it there is. Leaving these on a
    ///      one-transaction owner call let a compromised key divert every future operator fee
    ///      with no delay and nothing for watchers to react to — while every other pointer here
    ///      already carried the 2-day path.
    ///
    ///      If setting both feeManager and feeRecipient from scratch, use setFeeConfig() instead.
    ///      Order constraint: feeRecipient must be set before feeManager (cannot enable fees without a recipient).
    /// @param _feeManager The new fee manager address (address(0) for free)
    function setFeeManager(address _feeManager) external onlyOwner onlyDuringSetup {
        _setFeeManager(_feeManager);
    }

    /// @notice Propose a fee manager change (2-day delay before activation)
    /// @param _feeManager The new fee manager address (address(0) for free)
    function proposeFeeManager(address _feeManager) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setFeeManager", _feeManager)));
    }

    /// @notice Activate a previously proposed fee manager change
    /// @param _feeManager The new fee manager address
    function activateFeeManager(address _feeManager) external onlyOwner {
        _activateAction(keccak256(abi.encode("setFeeManager", _feeManager)));
        _setFeeManager(_feeManager);
    }

    /// @notice Set fee recipient address
    /// @dev Immediate during initial setup, timelocked after completeSetup() — see
    ///      {setFeeManager} for why the fee pointers are trust-boundary state.
    /// @param _feeRecipient The new fee recipient address
    function setFeeRecipient(address _feeRecipient) external onlyOwner onlyDuringSetup {
        _setFeeRecipient(_feeRecipient);
    }

    /// @notice Propose a fee recipient change (2-day delay before activation)
    /// @param _feeRecipient The new fee recipient address
    function proposeFeeRecipient(address _feeRecipient) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setFeeRecipient", _feeRecipient)));
    }

    /// @notice Activate a previously proposed fee recipient change
    /// @param _feeRecipient The new fee recipient address
    function activateFeeRecipient(address _feeRecipient) external onlyOwner {
        _activateAction(keccak256(abi.encode("setFeeRecipient", _feeRecipient)));
        _setFeeRecipient(_feeRecipient);
    }

    /// @notice Set both fee manager and fee recipient atomically
    /// @dev Avoids ordering issues when configuring fees from scratch.
    ///      To disable fees, pass address(0) for both.
    ///      Immediate during initial setup, timelocked after completeSetup() — see
    ///      {setFeeManager}. The atomic pair has its OWN action key, so a proposal to change
    ///      both cannot be activated as two separate single-pointer changes (or vice versa).
    /// @param _feeManager The fee manager address (address(0) to disable)
    /// @param _feeRecipient The fee recipient address
    function setFeeConfig(address _feeManager, address _feeRecipient) external onlyOwner onlyDuringSetup {
        _setFeeConfig(_feeManager, _feeRecipient);
    }

    /// @notice Propose an atomic fee configuration change (2-day delay before activation)
    /// @param _feeManager The fee manager address (address(0) to disable)
    /// @param _feeRecipient The fee recipient address
    function proposeFeeConfig(address _feeManager, address _feeRecipient) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setFeeConfig", _feeManager, _feeRecipient)));
    }

    /// @notice Activate a previously proposed atomic fee configuration change
    /// @param _feeManager The fee manager address
    /// @param _feeRecipient The fee recipient address
    function activateFeeConfig(address _feeManager, address _feeRecipient) external onlyOwner {
        _activateAction(keccak256(abi.encode("setFeeConfig", _feeManager, _feeRecipient)));
        _setFeeConfig(_feeManager, _feeRecipient);
    }

    function _setFeeManager(address _feeManager) internal {
        if (_feeManager != address(0) && feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
        }
        feeManager = _feeManager;
        emit FeeManagerSet(_feeManager);
    }

    function _setFeeRecipient(address _feeRecipient) internal {
        if (feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
        }
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    function _setFeeConfig(address _feeManager, address _feeRecipient) internal {
        if (_feeManager != address(0) && _feeRecipient == address(0)) {
            revert OperatorSubmitter__InvalidFeeConfig();
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IRegistryHub } from "./interfaces/IRegistryHub.sol";
import { IStolenWalletRegistry } from "./interfaces/IStolenWalletRegistry.sol";
import { IStolenTransactionRegistry } from "./interfaces/IStolenTransactionRegistry.sol";
import { IFeeManager } from "./interfaces/IFeeManager.sol";

/// @title RegistryHub
/// @author Stolen Wallet Registry Team
/// @notice Central coordination point for fraud registry subregistries
/// @dev Uses Ownable2Step for safe DAO ownership transfer.
///      Supports optional FeeManager (address(0) = free registrations).
contract RegistryHub is IRegistryHub, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Registry type identifier for stolen wallets
    bytes32 public constant STOLEN_WALLET = keccak256("STOLEN_WALLET_REGISTRY");
    /// @notice Registry type identifier for fraudulent contracts
    bytes32 public constant FRAUDULENT_CONTRACT = keccak256("FRAUDULENT_CONTRACT_REGISTRY");
    /// @notice Registry type identifier for stolen transactions
    bytes32 public constant STOLEN_TRANSACTION = keccak256("STOLEN_TRANSACTION_REGISTRY");

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Whether the hub is paused (blocks registrations)
    bool public paused;

    /// @notice Fee manager address (address(0) = no fees, free registrations)
    address public feeManager;

    /// @notice Cross-chain inbox address (address(0) = cross-chain disabled)
    address public crossChainInbox;

    /// @notice Mapping of registry type -> registry address
    mapping(bytes32 => address) private subRegistries;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the registry hub with owner and optional fee manager
    /// @param _owner Contract owner (deployer or DAO multisig)
    /// @param _feeManager Fee manager address (address(0) for free registrations)
    /// @param _stolenWalletRegistry Initial stolen wallet registry address
    constructor(address _owner, address _feeManager, address _stolenWalletRegistry) Ownable(_owner) {
        feeManager = _feeManager;
        if (_stolenWalletRegistry != address(0)) {
            subRegistries[STOLEN_WALLET] = _stolenWalletRegistry;
            emit RegistryUpdated(STOLEN_WALLET, _stolenWalletRegistry);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    modifier onlyCrossChainInbox() {
        _requireCrossChainInbox();
        _;
    }

    function _requireNotPaused() internal view {
        if (paused) revert Hub__Paused();
    }

    function _requireCrossChainInbox() internal view {
        if (msg.sender != crossChainInbox) revert Hub__UnauthorizedInbox();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Interface implementations
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IRegistryHub
    function stolenWalletRegistryType() external pure returns (bytes32) {
        return STOLEN_WALLET;
    }

    /// @inheritdoc IRegistryHub
    function fraudulentContractRegistryType() external pure returns (bytes32) {
        return FRAUDULENT_CONTRACT;
    }

    /// @inheritdoc IRegistryHub
    function stolenTransactionRegistryType() external pure returns (bytes32) {
        return STOLEN_TRANSACTION;
    }

    /// @inheritdoc IRegistryHub
    function getRegistry(bytes32 registryType) external view returns (address) {
        return subRegistries[registryType];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY PASSTHROUGHS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IRegistryHub
    function isWalletRegistered(address wallet) external view returns (bool) {
        address registry = subRegistries[STOLEN_WALLET];
        if (registry == address(0)) return false;
        return IStolenWalletRegistry(registry).isRegistered(wallet);
    }

    /// @inheritdoc IRegistryHub
    function isWalletPending(address wallet) external view returns (bool) {
        address registry = subRegistries[STOLEN_WALLET];
        if (registry == address(0)) return false;
        return IStolenWalletRegistry(registry).isPending(wallet);
    }

    /// @inheritdoc IRegistryHub
    function isTransactionBatchRegistered(bytes32 batchId) external view returns (bool) {
        address registry = subRegistries[STOLEN_TRANSACTION];
        if (registry == address(0)) return false;
        return IStolenTransactionRegistry(registry).isBatchRegistered(batchId);
    }

    /// @inheritdoc IRegistryHub
    function isTransactionBatchPending(address reporter) external view returns (bool) {
        address registry = subRegistries[STOLEN_TRANSACTION];
        if (registry == address(0)) return false;
        return IStolenTransactionRegistry(registry).isPending(reporter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE HANDLING (OPTIONAL)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get current fee in wei (0 if no fee manager configured)
    /// @return The current registration fee in wei
    function currentFeeWei() external view returns (uint256) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).currentFeeWei();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IRegistryHub
    function registerFromSpoke(
        address wallet,
        uint32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external onlyCrossChainInbox whenNotPaused {
        // Route to StolenWalletRegistry for storage
        address registry = subRegistries[STOLEN_WALLET];
        if (registry == address(0)) revert Hub__InvalidRegistry();

        IStolenWalletRegistry(registry)
            .registerFromHub(wallet, sourceChainId, isSponsored, bridgeId, crossChainMessageId);

        emit CrossChainRegistration(wallet, sourceChainId, crossChainMessageId);
    }

    /// @inheritdoc IRegistryHub
    function registerTransactionBatchFromSpoke(
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
    ) external onlyCrossChainInbox whenNotPaused {
        // Route to StolenTransactionRegistry for storage
        address registry = subRegistries[STOLEN_TRANSACTION];
        if (registry == address(0)) revert Hub__InvalidRegistry();

        IStolenTransactionRegistry(registry)
            .registerFromHub(
                merkleRoot,
                reporter,
                reportedChainId,
                sourceChainId,
                transactionCount,
                transactionHashes,
                chainIds,
                isSponsored,
                bridgeId,
                crossChainMessageId
            );

        emit CrossChainBatchRegistration(reporter, sourceChainId, reportedChainId, crossChainMessageId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IRegistryHub
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit HubPaused(_paused);
    }

    /// @inheritdoc IRegistryHub
    function setRegistry(bytes32 registryType, address registry) external onlyOwner {
        subRegistries[registryType] = registry;
        emit RegistryUpdated(registryType, registry);
    }

    /// @inheritdoc IRegistryHub
    function setFeeManager(address _feeManager) external onlyOwner {
        feeManager = _feeManager;
        emit FeeManagerUpdated(_feeManager);
    }

    /// @inheritdoc IRegistryHub
    function setCrossChainInbox(address _inbox) external onlyOwner {
        crossChainInbox = _inbox;
        emit CrossChainInboxUpdated(_inbox);
    }

    /// @inheritdoc IRegistryHub
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert Hub__ZeroAddress();
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert Hub__WithdrawalFailed();
        emit FeesWithdrawn(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE ETH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Allows the contract to receive ETH for fee collection
    receive() external payable { }
}

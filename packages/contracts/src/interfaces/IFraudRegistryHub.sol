// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IWalletRegistry } from "./IWalletRegistry.sol";
import { ITransactionRegistry } from "./ITransactionRegistry.sol";
import { IContractRegistry } from "./IContractRegistry.sol";

/// @title IFraudRegistryHub
/// @author Stolen Wallet Registry Team
/// @notice Interface for the Fraud Registry Hub - entry point and cross-chain coordinator
/// @dev Routes cross-chain messages to appropriate registries and provides unified query interface
interface IFraudRegistryHub {
    // ═══════════════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Registry type identifiers
    enum RegistryType {
        WALLET,
        TRANSACTION,
        CONTRACT
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error FraudRegistryHub__ZeroAddress();
    error FraudRegistryHub__OnlyInbox();
    error FraudRegistryHub__InvalidIdentifierLength();
    error FraudRegistryHub__UnknownRegistryType();
    error FraudRegistryHub__WithdrawFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a registry address is updated
    /// @param registryType The type of registry
    /// @param oldRegistry Previous registry address
    /// @param newRegistry New registry address
    event RegistryUpdated(RegistryType indexed registryType, address oldRegistry, address newRegistry);

    /// @notice Emitted when inbox address is updated
    /// @param oldInbox Previous inbox address
    /// @param newInbox New inbox address
    event InboxUpdated(address oldInbox, address newInbox);

    /// @notice Emitted when fees are withdrawn
    /// @param recipient Address receiving the fees
    /// @param amount Amount withdrawn
    event FeesWithdrawn(address indexed recipient, uint256 amount);

    /// @notice Emitted when fee recipient is updated
    /// @param oldRecipient Previous fee recipient
    /// @param newRecipient New fee recipient
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN ROUTING (Inbox Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Route wallet registration from cross-chain message
    /// @dev Called by CrossChainInbox when receiving wallet registration messages
    /// @param namespaceHash CAIP-2 namespace hash
    /// @param chainRefHash CAIP-2 chain reference hash (ignored for EVM wallets due to wildcard key)
    /// @param identifier Wallet identifier
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred
    /// @param incidentTimestamp Unix timestamp when incident occurred
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param isSponsored Whether registration was gas-sponsored
    /// @param bridgeId Bridge protocol ID
    /// @param messageId Cross-chain message ID
    function registerWalletFromSpoke(
        bytes32 namespaceHash,
        bytes32 chainRefHash,
        bytes32 identifier,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bytes32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 messageId
    ) external;

    /// @notice Route transaction batch registration from cross-chain message
    /// @dev Called by CrossChainInbox when receiving transaction registration messages
    /// @param reporter Address that submitted the registration
    /// @param dataHash Hash of (txHashes, chainIds)
    /// @param reportedChainId CAIP-2 chain ID hash where transactions were reported
    /// @param sourceChainId CAIP-2 chain ID hash where registration was submitted
    /// @param isSponsored Whether registration was gas-sponsored
    /// @param transactionHashes Array of transaction hashes
    /// @param chainIds Array of CAIP-2 chain ID hashes
    /// @param bridgeId Bridge protocol ID
    /// @param messageId Cross-chain message ID
    function registerTransactionsFromSpoke(
        address reporter,
        bytes32 dataHash,
        bytes32 reportedChainId,
        bytes32 sourceChainId,
        bool isSponsored,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint8 bridgeId,
        bytes32 messageId
    ) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED QUERY INTERFACE - CAIP-10 String
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if any identifier is registered across all registries
    /// @dev Routes based on identifier length: 20 bytes = address, 32 bytes = tx hash
    ///      For address types, checks both wallet and contract registries
    /// @param caip10 The CAIP-10 identifier (e.g., "eip155:8453:0x742d35...")
    /// @return True if registered in any registry
    function isRegistered(string calldata caip10) external view returns (bool);

    /// @notice Get the registry type(s) where an identifier is registered
    /// @param caip10 The CAIP-10 identifier
    /// @return registeredIn Array of registry types where identifier is registered
    function getRegisteredTypes(string calldata caip10) external view returns (RegistryType[] memory registeredIn);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASSTHROUGH VIEW FUNCTIONS - Typed EVM Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if wallet is registered (passthrough to WalletRegistry)
    /// @param wallet The wallet address
    /// @return True if registered
    function isWalletRegistered(address wallet) external view returns (bool);

    /// @notice Check if transaction is registered (passthrough to TransactionRegistry)
    /// @param txHash The transaction hash
    /// @param chainId CAIP-2 chain ID hash (e.g., keccak256("eip155:8453"))
    /// @return True if registered
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool);

    /// @notice Check if contract is registered (passthrough to ContractRegistry)
    /// @param contractAddress The contract address
    /// @param chainId CAIP-2 chain ID hash
    /// @return True if registered
    function isContractRegistered(address contractAddress, bytes32 chainId) external view returns (bool);

    /// @notice Get wallet entry (passthrough to WalletRegistry)
    /// @param wallet The wallet address
    /// @return The wallet entry data
    function getWalletEntry(address wallet) external view returns (IWalletRegistry.WalletEntry memory);

    /// @notice Get transaction entry (passthrough to TransactionRegistry)
    /// @param txHash The transaction hash
    /// @param chainId CAIP-2 chain ID hash
    /// @return The transaction entry data
    function getTransactionEntry(bytes32 txHash, bytes32 chainId)
        external
        view
        returns (ITransactionRegistry.TransactionEntry memory);

    /// @notice Get contract entry (passthrough to ContractRegistry)
    /// @param contractAddress The contract address
    /// @param chainId CAIP-2 chain ID hash
    /// @return The contract entry data
    function getContractEntry(address contractAddress, bytes32 chainId)
        external
        view
        returns (IContractRegistry.ContractEntry memory);

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRY ADDRESSES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get wallet registry address
    /// @return The WalletRegistry address
    function walletRegistry() external view returns (address);

    /// @notice Get transaction registry address
    /// @return The TransactionRegistry address
    function transactionRegistry() external view returns (address);

    /// @notice Get contract registry address
    /// @return The ContractRegistry address
    function contractRegistry() external view returns (address);

    /// @notice Get cross-chain inbox address
    /// @return The CrossChainInbox address
    function inbox() external view returns (address);

    /// @notice Get fee recipient address
    /// @return The fee recipient address
    function feeRecipient() external view returns (address);

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw accumulated fees to fee recipient
    /// @dev Only callable by owner
    function withdrawFees() external;

    /// @notice Receive fees from registries
    /// @dev Called by registries when collecting fees
    receive() external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set wallet registry address
    /// @param newWalletRegistry The new WalletRegistry address
    function setWalletRegistry(address newWalletRegistry) external;

    /// @notice Set transaction registry address
    /// @param newTransactionRegistry The new TransactionRegistry address
    function setTransactionRegistry(address newTransactionRegistry) external;

    /// @notice Set contract registry address
    /// @param newContractRegistry The new ContractRegistry address
    function setContractRegistry(address newContractRegistry) external;

    /// @notice Set cross-chain inbox address
    /// @param newInbox The new CrossChainInbox address
    function setInbox(address newInbox) external;

    /// @notice Set fee recipient address
    /// @param newFeeRecipient The new fee recipient address
    function setFeeRecipient(address newFeeRecipient) external;

    /// @notice Pause cross-chain registrations
    /// @dev Only affects cross-chain messages, not direct registrations
    function pause() external;

    /// @notice Unpause cross-chain registrations
    function unpause() external;
}

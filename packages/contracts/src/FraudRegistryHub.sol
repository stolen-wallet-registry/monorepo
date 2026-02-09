// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { IFraudRegistryHub } from "./interfaces/IFraudRegistryHub.sol";
import { IWalletRegistry } from "./interfaces/IWalletRegistry.sol";
import { ITransactionRegistry } from "./interfaces/ITransactionRegistry.sol";
import { IContractRegistry } from "./interfaces/IContractRegistry.sol";
import { CAIP10 } from "./libraries/CAIP10.sol";

/// @title FraudRegistryHub
/// @author Stolen Wallet Registry Team
/// @notice Entry point and cross-chain coordinator for the fraud registry system
/// @dev Key responsibilities:
///      - Routes cross-chain messages to appropriate registries
///      - Provides unified query interface (isRegistered with CAIP-10)
///      - Aggregates fees from all registries
///      - Pause control for cross-chain registrations only
///
///      NOTE: Pause only affects cross-chain registrations.
///      Users can still register directly to individual registries on the hub chain.
contract FraudRegistryHub is IFraudRegistryHub, Ownable2Step, Pausable {
    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet registry address
    address public walletRegistry;

    /// @notice Transaction registry address
    address public transactionRegistry;

    /// @notice Contract registry address
    address public contractRegistry;

    /// @notice Cross-chain inbox address (receives messages from bridges)
    address public inbox;

    /// @notice Fee recipient address
    address public feeRecipient;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the hub
    /// @param _owner Initial owner
    /// @param _feeRecipient Initial fee recipient
    constructor(address _owner, address _feeRecipient) Ownable(_owner) {
        if (_owner == address(0)) revert FraudRegistryHub__ZeroAddress();
        if (_feeRecipient == address(0)) revert FraudRegistryHub__ZeroAddress();
        feeRecipient = _feeRecipient;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyInbox() {
        if (msg.sender != inbox || inbox == address(0)) {
            revert FraudRegistryHub__OnlyInbox();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN ROUTING (Inbox Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHub
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
    ) external onlyInbox whenNotPaused {
        if (walletRegistry == address(0)) revert FraudRegistryHub__ZeroAddress();

        IWalletRegistry(walletRegistry)
            .registerFromHub(
                namespaceHash,
                chainRefHash,
                identifier,
                reportedChainId,
                incidentTimestamp,
                sourceChainId,
                isSponsored,
                bridgeId,
                messageId
            );
    }

    /// @inheritdoc IFraudRegistryHub
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
    ) external onlyInbox whenNotPaused {
        if (transactionRegistry == address(0)) revert FraudRegistryHub__ZeroAddress();

        ITransactionRegistry(transactionRegistry)
            .registerTransactionsFromHub(
                reporter,
                dataHash,
                reportedChainId,
                sourceChainId,
                isSponsored,
                transactionHashes,
                chainIds,
                bridgeId,
                messageId
            );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED QUERY INTERFACE - CAIP-10 String
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHub
    function isRegistered(string calldata caip10) external view returns (bool) {
        // Parse CAIP-10 to determine identifier length
        (,,, uint256 addrLen) = CAIP10.parse(caip10);

        // Determine type based on identifier length
        // 42 chars (0x + 40 hex) = EVM address (20 bytes)
        // 66 chars (0x + 64 hex) = transaction hash (32 bytes)
        //
        // NOTE: We intentionally do NOT accept 64-char (no 0x) transaction hashes.
        // Enforcing a single canonical format avoids ambiguous client behavior.

        if (addrLen == 42) {
            // Could be wallet or contract - check both
            if (walletRegistry != address(0)) {
                if (IWalletRegistry(walletRegistry).isWalletRegistered(caip10)) {
                    return true;
                }
            }
            if (contractRegistry != address(0)) {
                if (IContractRegistry(contractRegistry).isContractRegistered(caip10)) {
                    return true;
                }
            }
            return false;
        } else if (addrLen == 66) {
            // Transaction hash
            if (transactionRegistry != address(0)) {
                return ITransactionRegistry(transactionRegistry).isTransactionRegistered(caip10);
            }
            return false;
        }

        revert FraudRegistryHub__InvalidIdentifierLength();
    }

    /// @inheritdoc IFraudRegistryHub
    function getRegisteredTypes(string calldata caip10) external view returns (RegistryType[] memory registeredIn) {
        (,,, uint256 addrLen) = CAIP10.parse(caip10);

        uint256 count = 0;
        bool isWallet = false;
        bool isContract = false;
        bool isTransaction = false;

        if (addrLen == 42) {
            // Check wallet and contract registries
            if (walletRegistry != address(0) && IWalletRegistry(walletRegistry).isWalletRegistered(caip10)) {
                isWallet = true;
                count++;
            }
            if (contractRegistry != address(0) && IContractRegistry(contractRegistry).isContractRegistered(caip10)) {
                isContract = true;
                count++;
            }
        } else if (addrLen == 66) {
            if (
                transactionRegistry != address(0)
                    && ITransactionRegistry(transactionRegistry).isTransactionRegistered(caip10)
            ) {
                isTransaction = true;
                count++;
            }
        } else {
            revert FraudRegistryHub__InvalidIdentifierLength();
        }

        registeredIn = new RegistryType[](count);
        uint256 idx = 0;

        if (isWallet) registeredIn[idx++] = RegistryType.WALLET;
        if (isTransaction) registeredIn[idx++] = RegistryType.TRANSACTION;
        if (isContract) registeredIn[idx++] = RegistryType.CONTRACT;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASSTHROUGH VIEW FUNCTIONS - Typed EVM Interface (Gas Efficient)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHub
    function isWalletRegistered(address wallet) external view returns (bool) {
        if (walletRegistry == address(0)) return false;
        return IWalletRegistry(walletRegistry).isWalletRegistered(wallet);
    }

    /// @inheritdoc IFraudRegistryHub
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool) {
        if (transactionRegistry == address(0)) return false;
        return ITransactionRegistry(transactionRegistry).isTransactionRegistered(txHash, chainId);
    }

    /// @inheritdoc IFraudRegistryHub
    function isContractRegistered(address contractAddress, bytes32 chainId) external view returns (bool) {
        if (contractRegistry == address(0)) return false;
        return IContractRegistry(contractRegistry).isContractRegistered(contractAddress, chainId);
    }

    /// @inheritdoc IFraudRegistryHub
    function getWalletEntry(address wallet) external view returns (IWalletRegistry.WalletEntry memory) {
        if (walletRegistry == address(0)) {
            return IWalletRegistry.WalletEntry({
                registeredAt: 0,
                reportedChainId: bytes32(0),
                incidentTimestamp: 0,
                sourceChainId: bytes32(0),
                isSponsored: false,
                bridgeId: 0,
                messageId: bytes32(0)
            });
        }
        return IWalletRegistry(walletRegistry).getWalletEntry(wallet);
    }

    /// @inheritdoc IFraudRegistryHub
    function getTransactionEntry(bytes32 txHash, bytes32 chainId)
        external
        view
        returns (ITransactionRegistry.TransactionEntry memory)
    {
        if (transactionRegistry == address(0)) {
            return ITransactionRegistry.TransactionEntry({
                registeredAt: 0,
                reportedChainId: bytes32(0),
                reporter: address(0),
                sourceChainId: bytes32(0),
                isSponsored: false,
                bridgeId: 0,
                messageId: bytes32(0)
            });
        }
        return ITransactionRegistry(transactionRegistry).getTransactionEntry(txHash, chainId);
    }

    /// @inheritdoc IFraudRegistryHub
    function getContractEntry(address contractAddress, bytes32 chainId)
        external
        view
        returns (IContractRegistry.ContractEntry memory)
    {
        if (contractRegistry == address(0)) {
            return IContractRegistry.ContractEntry({
                registeredAt: 0, reportedChainId: bytes32(0), operatorId: bytes32(0), batchId: 0
            });
        }
        return IContractRegistry(contractRegistry).getContractEntry(contractAddress, chainId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHub
    receive() external payable {
        // Accept fees from registries
    }

    /// @inheritdoc IFraudRegistryHub
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) return;

        (bool success,) = feeRecipient.call{ value: balance }("");
        if (!success) revert FraudRegistryHub__WithdrawFailed();

        emit FeesWithdrawn(feeRecipient, balance);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHub
    function setWalletRegistry(address newWalletRegistry) external onlyOwner {
        if (newWalletRegistry == address(0)) revert FraudRegistryHub__ZeroAddress();
        address old = walletRegistry;
        walletRegistry = newWalletRegistry;
        emit RegistryUpdated(RegistryType.WALLET, old, newWalletRegistry);
    }

    /// @inheritdoc IFraudRegistryHub
    function setTransactionRegistry(address newTransactionRegistry) external onlyOwner {
        if (newTransactionRegistry == address(0)) revert FraudRegistryHub__ZeroAddress();
        address old = transactionRegistry;
        transactionRegistry = newTransactionRegistry;
        emit RegistryUpdated(RegistryType.TRANSACTION, old, newTransactionRegistry);
    }

    /// @inheritdoc IFraudRegistryHub
    function setContractRegistry(address newContractRegistry) external onlyOwner {
        if (newContractRegistry == address(0)) revert FraudRegistryHub__ZeroAddress();
        address old = contractRegistry;
        contractRegistry = newContractRegistry;
        emit RegistryUpdated(RegistryType.CONTRACT, old, newContractRegistry);
    }

    /// @inheritdoc IFraudRegistryHub
    function setInbox(address newInbox) external onlyOwner {
        if (newInbox == address(0)) revert FraudRegistryHub__ZeroAddress();
        address old = inbox;
        inbox = newInbox;
        emit InboxUpdated(old, newInbox);
    }

    /// @inheritdoc IFraudRegistryHub
    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert FraudRegistryHub__ZeroAddress();
        address old = feeRecipient;
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(old, newFeeRecipient);
    }

    /// @inheritdoc IFraudRegistryHub
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc IFraudRegistryHub
    function unpause() external onlyOwner {
        _unpause();
    }
}

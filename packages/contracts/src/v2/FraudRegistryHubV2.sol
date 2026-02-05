// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { IFraudRegistryHubV2 } from "./interfaces/IFraudRegistryHubV2.sol";
import { IWalletRegistryV2 } from "./interfaces/IWalletRegistryV2.sol";
import { ITransactionRegistryV2 } from "./interfaces/ITransactionRegistryV2.sol";
import { IContractRegistryV2 } from "./interfaces/IContractRegistryV2.sol";
import { CAIP10 } from "./libraries/CAIP10.sol";

/// @title FraudRegistryHubV2
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
contract FraudRegistryHubV2 is IFraudRegistryHubV2, Ownable2Step, Pausable {
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
        if (_owner == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        if (_feeRecipient == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        feeRecipient = _feeRecipient;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlyInbox() {
        if (msg.sender != inbox || inbox == address(0)) {
            revert FraudRegistryHubV2__OnlyInbox();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN ROUTING (Inbox Only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHubV2
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
        if (walletRegistry == address(0)) revert FraudRegistryHubV2__ZeroAddress();

        IWalletRegistryV2(walletRegistry)
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

    /// @inheritdoc IFraudRegistryHubV2
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
        if (transactionRegistry == address(0)) revert FraudRegistryHubV2__ZeroAddress();

        ITransactionRegistryV2(transactionRegistry)
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

    /// @inheritdoc IFraudRegistryHubV2
    function isRegistered(string calldata caip10) external view returns (bool) {
        // Parse CAIP-10 to determine identifier length
        (,,, uint256 addrLen) = CAIP10.parse(caip10);

        // Determine type based on identifier length
        // 42 chars (0x + 40 hex) = EVM address (20 bytes)
        // 64 chars (no 0x) or 66 chars (0x + 64 hex) = transaction hash (32 bytes)

        if (addrLen == 42) {
            // Could be wallet or contract - check both
            if (walletRegistry != address(0)) {
                if (IWalletRegistryV2(walletRegistry).isWalletRegistered(caip10)) {
                    return true;
                }
            }
            if (contractRegistry != address(0)) {
                if (IContractRegistryV2(contractRegistry).isContractRegistered(caip10)) {
                    return true;
                }
            }
            return false;
        } else if (addrLen == 64 || addrLen == 66) {
            // Transaction hash
            if (transactionRegistry != address(0)) {
                return ITransactionRegistryV2(transactionRegistry).isTransactionRegistered(caip10);
            }
            return false;
        }

        return false;
    }

    /// @inheritdoc IFraudRegistryHubV2
    function getRegisteredTypes(string calldata caip10) external view returns (RegistryType[] memory registeredIn) {
        (,,, uint256 addrLen) = CAIP10.parse(caip10);

        uint256 count = 0;
        bool isWallet = false;
        bool isContract = false;
        bool isTransaction = false;

        if (addrLen == 42) {
            // Check wallet and contract registries
            if (walletRegistry != address(0) && IWalletRegistryV2(walletRegistry).isWalletRegistered(caip10)) {
                isWallet = true;
                count++;
            }
            if (contractRegistry != address(0) && IContractRegistryV2(contractRegistry).isContractRegistered(caip10)) {
                isContract = true;
                count++;
            }
        } else if (addrLen == 64 || addrLen == 66) {
            if (
                transactionRegistry != address(0)
                    && ITransactionRegistryV2(transactionRegistry).isTransactionRegistered(caip10)
            ) {
                isTransaction = true;
                count++;
            }
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

    /// @inheritdoc IFraudRegistryHubV2
    function isWalletRegistered(address wallet) external view returns (bool) {
        if (walletRegistry == address(0)) return false;
        return IWalletRegistryV2(walletRegistry).isWalletRegistered(wallet);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function isTransactionRegistered(bytes32 txHash, bytes32 chainId) external view returns (bool) {
        if (transactionRegistry == address(0)) return false;
        return ITransactionRegistryV2(transactionRegistry).isTransactionRegistered(txHash, chainId);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function isContractRegistered(address contractAddress, bytes32 chainId) external view returns (bool) {
        if (contractRegistry == address(0)) return false;
        return IContractRegistryV2(contractRegistry).isContractRegistered(contractAddress, chainId);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function getWalletEntry(address wallet) external view returns (IWalletRegistryV2.WalletEntry memory) {
        if (walletRegistry == address(0)) {
            return IWalletRegistryV2.WalletEntry({
                registeredAt: 0,
                reportedChainId: bytes32(0),
                incidentTimestamp: 0,
                sourceChainId: bytes32(0),
                isSponsored: false,
                bridgeId: 0,
                messageId: bytes32(0)
            });
        }
        return IWalletRegistryV2(walletRegistry).getWalletEntry(wallet);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function getTransactionEntry(bytes32 txHash, bytes32 chainId)
        external
        view
        returns (ITransactionRegistryV2.TransactionEntry memory)
    {
        if (transactionRegistry == address(0)) {
            return ITransactionRegistryV2.TransactionEntry({
                registeredAt: 0,
                reportedChainId: bytes32(0),
                reporter: address(0),
                sourceChainId: bytes32(0),
                isSponsored: false,
                bridgeId: 0,
                messageId: bytes32(0)
            });
        }
        return ITransactionRegistryV2(transactionRegistry).getTransactionEntry(txHash, chainId);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function getContractEntry(address contractAddress, bytes32 chainId)
        external
        view
        returns (IContractRegistryV2.ContractEntry memory)
    {
        if (contractRegistry == address(0)) {
            return IContractRegistryV2.ContractEntry({
                registeredAt: 0, reportedChainId: bytes32(0), operatorId: bytes32(0), batchId: 0
            });
        }
        return IContractRegistryV2(contractRegistry).getContractEntry(contractAddress, chainId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHubV2
    receive() external payable {
        // Accept fees from registries
    }

    /// @inheritdoc IFraudRegistryHubV2
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) return;

        (bool success,) = feeRecipient.call{ value: balance }("");
        if (!success) revert FraudRegistryHubV2__WithdrawFailed();

        emit FeesWithdrawn(feeRecipient, balance);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFraudRegistryHubV2
    function setWalletRegistry(address newWalletRegistry) external onlyOwner {
        if (newWalletRegistry == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        address old = walletRegistry;
        walletRegistry = newWalletRegistry;
        emit RegistryUpdated(RegistryType.WALLET, old, newWalletRegistry);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function setTransactionRegistry(address newTransactionRegistry) external onlyOwner {
        if (newTransactionRegistry == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        address old = transactionRegistry;
        transactionRegistry = newTransactionRegistry;
        emit RegistryUpdated(RegistryType.TRANSACTION, old, newTransactionRegistry);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function setContractRegistry(address newContractRegistry) external onlyOwner {
        if (newContractRegistry == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        address old = contractRegistry;
        contractRegistry = newContractRegistry;
        emit RegistryUpdated(RegistryType.CONTRACT, old, newContractRegistry);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function setInbox(address newInbox) external onlyOwner {
        if (newInbox == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        address old = inbox;
        inbox = newInbox;
        emit InboxUpdated(old, newInbox);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert FraudRegistryHubV2__ZeroAddress();
        address old = feeRecipient;
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(old, newFeeRecipient);
    }

    /// @inheritdoc IFraudRegistryHubV2
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc IFraudRegistryHubV2
    function unpause() external onlyOwner {
        _unpause();
    }
}

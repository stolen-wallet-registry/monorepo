// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EIP712Constants
/// @author Stolen Wallet Registry Team
/// @notice Shared EIP-712 constants for contracts
/// @dev Centralizes statement strings, statement hashes, and typehashes
///      to ensure consistency between hub and spoke contracts
library EIP712Constants {
    // ═══════════════════════════════════════════════════════════════════════════
    // STATEMENT STRINGS (displayed in MetaMask during signing)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Human-readable statement for wallet acknowledgement
    string internal constant ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.";

    /// @notice Human-readable statement for wallet registration
    string internal constant REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.";

    /// @notice Human-readable statement for transaction batch acknowledgement
    string internal constant TX_ACK_STATEMENT =
        "This signature acknowledges the intent to report stolen transactions to the Stolen Wallet Registry.";

    /// @notice Human-readable statement for transaction batch registration
    string internal constant TX_REG_STATEMENT =
        "This signature confirms permanent registration of stolen transactions in the Stolen Wallet Registry. This action is irreversible.";

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-COMPUTED STATEMENT HASHES (saves gas vs hashing at runtime)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Pre-computed hash of ACK_STATEMENT
    bytes32 internal constant ACK_STATEMENT_HASH = keccak256(bytes(ACK_STATEMENT));

    /// @notice Pre-computed hash of REG_STATEMENT
    bytes32 internal constant REG_STATEMENT_HASH = keccak256(bytes(REG_STATEMENT));

    /// @notice Pre-computed hash of TX_ACK_STATEMENT
    bytes32 internal constant TX_ACK_STATEMENT_HASH = keccak256(bytes(TX_ACK_STATEMENT));

    /// @notice Pre-computed hash of TX_REG_STATEMENT
    bytes32 internal constant TX_REG_STATEMENT_HASH = keccak256(bytes(TX_REG_STATEMENT));

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRATION TYPEHASHES (format with reportedChainId + incidentTimestamp)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice EIP-712 typehash for wallet acknowledgement phase
    /// @dev Includes reportedChainId (uint64 for storage efficiency) and incidentTimestamp.
    ///      Using uint64 reportedChainId supports EVM chain IDs up to 18 quintillion.
    ///      Both hub and spoke use identical typehashes for signature portability.
    bytes32 internal constant WALLET_ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    /// @notice EIP-712 typehash for wallet registration phase
    bytes32 internal constant WALLET_REG_TYPEHASH = keccak256(
        "Registration(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH TYPEHASHES (format with dataHash commitment)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice EIP-712 typehash for transaction batch acknowledgement
    /// @dev dataHash = keccak256(abi.encode(txHashes, chainIds))
    bytes32 internal constant TX_BATCH_ACK_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(string statement,address reporter,address forwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );

    /// @notice EIP-712 typehash for transaction batch registration
    bytes32 internal constant TX_BATCH_REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,address reporter,address forwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
    );
}

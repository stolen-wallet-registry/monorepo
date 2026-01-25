// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

/// @title EIP712TestHelper
/// @notice Shared EIP-712 constants and signing utilities for tests
/// @dev Inherit from this contract to get access to statement constants and signing helpers.
///      Statements and type hashes must match the production contracts exactly.
abstract contract EIP712TestHelper is Test {
    // ═══════════════════════════════════════════════════════════════════════════
    // EIP-712 DOMAIN CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant EIP712_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    string internal constant DOMAIN_VERSION = "4";

    // Domain names must match the production contracts
    string internal constant WALLET_DOMAIN_NAME = "StolenWalletRegistry";
    string internal constant TX_DOMAIN_NAME = "StolenTransactionRegistry";

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRY STATEMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    string internal constant WALLET_ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.";

    string internal constant WALLET_REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.";

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION REGISTRY STATEMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    string internal constant TX_ACK_STATEMENT =
        "This signature acknowledges that the specified transactions are being reported as fraudulent to the Stolen Transaction Registry.";

    string internal constant TX_REG_STATEMENT =
        "This signature confirms permanent registration of the specified transactions as fraudulent. This action is irreversible.";

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRY TYPE HASHES
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant WALLET_ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)"
    );

    bytes32 internal constant WALLET_REG_TYPEHASH =
        keccak256("Registration(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)");

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION REGISTRY TYPE HASHES
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant TX_ACK_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(string statement,bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)"
    );

    bytes32 internal constant TX_REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,bytes32 merkleRoot,bytes32 reportedChainId,address forwarder,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // DOMAIN SEPARATOR HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute domain separator for StolenWalletRegistry
    function _walletDomainSeparator(address registry) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_TYPE_HASH,
                keccak256(bytes(WALLET_DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                registry
            )
        );
    }

    /// @notice Compute domain separator for StolenTransactionRegistry
    function _txDomainSeparator(address registry) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_TYPE_HASH,
                keccak256(bytes(TX_DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                registry
            )
        );
    }

    /// @notice Compute domain separator for StolenWalletRegistry with custom chainId
    /// @dev Used for cross-chain signature tests where chainId differs from block.chainid
    function _walletDomainSeparatorWithChainId(address registry, uint256 chainId) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_TYPE_HASH,
                keccak256(bytes(WALLET_DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                chainId,
                registry
            )
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRY SIGNING HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Sign a wallet acknowledgement message
    function _signWalletAck(
        uint256 privateKey,
        address registry,
        address owner,
        address forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(WALLET_ACK_TYPEHASH, keccak256(bytes(WALLET_ACK_STATEMENT)), owner, forwarder, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _walletDomainSeparator(registry), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    /// @notice Sign a wallet registration message
    function _signWalletReg(
        uint256 privateKey,
        address registry,
        address owner,
        address forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(WALLET_REG_TYPEHASH, keccak256(bytes(WALLET_REG_STATEMENT)), owner, forwarder, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _walletDomainSeparator(registry), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION REGISTRY SIGNING HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Sign a transaction batch acknowledgement message
    function _signTxAck(
        uint256 privateKey,
        address registry,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                TX_ACK_TYPEHASH,
                keccak256(bytes(TX_ACK_STATEMENT)),
                merkleRoot,
                reportedChainId,
                transactionCount,
                forwarder,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _txDomainSeparator(registry), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    /// @notice Sign a transaction batch registration message
    function _signTxReg(
        uint256 privateKey,
        address registry,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                TX_REG_TYPEHASH,
                keccak256(bytes(TX_REG_STATEMENT)),
                merkleRoot,
                reportedChainId,
                forwarder,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _txDomainSeparator(registry), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }
}

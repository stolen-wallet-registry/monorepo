// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EIP712Constants } from "../../src/libraries/EIP712Constants.sol";

/// @title EIP712TestHelper
/// @notice Shared EIP-712 constants and signing utilities for tests
/// @dev Inherit from this contract to get access to statement constants and signing helpers.
///      All statement strings and typehashes are imported from EIP712Constants.sol
///      to guarantee they stay in sync with production.
abstract contract EIP712TestHelper is Test {
    // ═══════════════════════════════════════════════════════════════════════════
    // EIP-712 DOMAIN CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant EIP712_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    string internal constant DOMAIN_VERSION = "4";

    // All production contracts (WalletRegistry, TransactionRegistry, SpokeRegistry)
    // use the same EIP-712 domain name. Cross-contract replay is prevented by
    // distinct typehashes, not by domain separation.
    string internal constant WALLET_DOMAIN_NAME = "StolenWalletRegistry";

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRY STATEMENTS (imported from production)
    // ═══════════════════════════════════════════════════════════════════════════

    string internal constant WALLET_ACK_STATEMENT = EIP712Constants.ACK_STATEMENT;

    string internal constant WALLET_REG_STATEMENT = EIP712Constants.REG_STATEMENT;

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION REGISTRY STATEMENTS (imported from production)
    // ═══════════════════════════════════════════════════════════════════════════

    string internal constant TX_ACK_STATEMENT = EIP712Constants.TX_ACK_STATEMENT;

    string internal constant TX_REG_STATEMENT = EIP712Constants.TX_REG_STATEMENT;

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRY TYPE HASHES (imported from production)
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant WALLET_ACK_TYPEHASH = EIP712Constants.WALLET_ACK_TYPEHASH;

    bytes32 internal constant WALLET_REG_TYPEHASH = EIP712Constants.WALLET_REG_TYPEHASH;

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION REGISTRY TYPE HASHES (imported from production)
    // ═══════════════════════════════════════════════════════════════════════════

    bytes32 internal constant TX_BATCH_ACK_TYPEHASH = EIP712Constants.TX_BATCH_ACK_TYPEHASH;

    bytes32 internal constant TX_BATCH_REG_TYPEHASH = EIP712Constants.TX_BATCH_REG_TYPEHASH;

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
        address _wallet,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                WALLET_ACK_TYPEHASH,
                keccak256(bytes(WALLET_ACK_STATEMENT)),
                _wallet,
                forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _walletDomainSeparator(registry), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    /// @notice Sign a wallet registration message.
    /// @dev `windowBlock` is the post-grace freshness proof (see WALLET_REG_TYPEHASH). Its
    ///      HASH is what gets signed; the number itself travels as unsigned calldata to
    ///      `register`. Pass the same value to both. `blockhash` returns a real non-zero
    ///      value after `vm.roll` in Foundry, so no `vm.setBlockhash` is needed.
    ///      To exercise a rejection, pass a `windowBlock` below the acknowledgement's
    ///      grace start, at/above `block.number`, or more than 256 blocks back.
    function _signWalletReg(
        uint256 privateKey,
        address registry,
        address _wallet,
        address forwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline,
        uint256 windowBlock
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                WALLET_REG_TYPEHASH,
                keccak256(bytes(WALLET_REG_STATEMENT)),
                _wallet,
                forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline,
                blockhash(windowBlock)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _walletDomainSeparator(registry), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    /// @notice Roll one block past the grace start and return a valid `windowBlock`.
    /// @dev The window opens at `graceStart`, but `register` also requires
    ///      `windowBlock < block.number`, so a valid reference needs at least one block to
    ///      have been mined on top. Centralised here so every test expresses the same intent.
    ///
    ///      MIRRORED in test/SpokeRegistry.t.sol, which cannot inherit this helper (the spoke
    ///      signs reportedChainId/incidentTimestamp as uint64 where the hub uses bytes32, so the
    ///      typehashes differ). Keep the two bodies identical — see the note on that copy.
    /// @param graceStart The acknowledgement's grace-period start block
    /// @return windowBlock A block satisfying `graceStart <= windowBlock < block.number`
    function _rollToWindow(uint256 graceStart) internal returns (uint256 windowBlock) {
        if (block.number <= graceStart) vm.roll(graceStart + 1);
        return graceStart;
    }
}

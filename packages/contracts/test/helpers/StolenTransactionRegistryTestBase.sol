// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StolenTransactionRegistry } from "../../src/registries/StolenTransactionRegistry.sol";
import { MerkleTestHelper } from "./MerkleTestHelper.sol";
import { EIP712TestHelper } from "./EIP712TestHelper.sol";

/// @title StolenTransactionRegistryTestBase
/// @notice Shared test helpers for StolenTransactionRegistry tests
/// @dev Inherit from this contract to get access to common signing and data helpers.
///      Subclasses must set `registry` and `testChainId` in their setUp().
abstract contract StolenTransactionRegistryTestBase is EIP712TestHelper {
    /// @dev Must be set by subclass setUp()
    StolenTransactionRegistry public registry;

    /// @dev Must be set by subclass setUp()
    bytes32 internal testChainId;

    // ═══════════════════════════════════════════════════════════════════════════
    // DOMAIN & SIGNING HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getDomainSeparator() internal view returns (bytes32) {
        return _txDomainSeparator(address(registry));
    }

    function _signAcknowledgement(
        uint256 privateKey,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        uint32 transactionCount,
        address _forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        return _signTxAck(
            privateKey, address(registry), merkleRoot, reportedChainId, transactionCount, _forwarder, nonce, deadline
        );
    }

    function _signRegistration(
        uint256 privateKey,
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address _forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        return _signTxReg(privateKey, address(registry), merkleRoot, reportedChainId, _forwarder, nonce, deadline);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST DATA HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getTestTxHashes() internal view returns (bytes32[] memory txHashes) {
        bytes32[] memory chainIds;
        (txHashes, chainIds) = _getTestData();
    }

    function _getTestChainIds() internal view returns (bytes32[] memory chainIds) {
        bytes32[] memory txHashes;
        (txHashes, chainIds) = _getTestData();
    }

    /// @notice Returns sorted test transaction data (3 txs on testChainId)
    function _getTestData() internal view returns (bytes32[] memory txHashes, bytes32[] memory chainIds) {
        txHashes = new bytes32[](3);
        chainIds = new bytes32[](3);
        txHashes[0] = keccak256("tx1");
        txHashes[1] = keccak256("tx2");
        txHashes[2] = keccak256("tx3");
        chainIds[0] = testChainId;
        chainIds[1] = testChainId;
        chainIds[2] = testChainId;
        MerkleTestHelper.sortBytes32Values(txHashes, chainIds);
    }

    /// @dev Compute merkle root from transaction hashes and chain IDs
    function _computeMerkleRoot(bytes32[] memory txHashes, bytes32[] memory chainIds) internal pure returns (bytes32) {
        return MerkleTestHelper.computeBytes32Root(txHashes, chainIds);
    }

    /// @notice Computes merkle root for standard test data (3 transactions)
    function _computeTestMerkleRoot() internal view returns (bytes32) {
        (bytes32[] memory txHashes, bytes32[] memory chainIds) = _getTestData();
        return MerkleTestHelper.computeBytes32Root(txHashes, chainIds);
    }
}

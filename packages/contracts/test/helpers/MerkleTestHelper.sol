// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { MerkleRootComputation } from "../../src/libraries/MerkleRootComputation.sol";

/// @title MerkleTestHelper
/// @notice Shared test utilities for merkle tree operations
/// @dev Provides sorting functions that prepare arrays for computeRootFromSorted()
///      All sorting functions modify arrays in-place using insertion sort.
library MerkleTestHelper {
    /// @notice Compute merkle root for (address, bytes32) entries and sort arrays in-place
    /// @dev Sorts both addresses and chainIds arrays by their leaf hash (ascending order)
    /// @param addresses Array of addresses (modified in-place to sorted order)
    /// @param chainIds Array of chain IDs (modified in-place to match sorted addresses)
    /// @return Merkle root computed from sorted leaves
    function computeAddressRoot(address[] memory addresses, bytes32[] memory chainIds) internal pure returns (bytes32) {
        uint256 length = addresses.length;
        if (length == 0) return bytes32(0);
        if (length == 1) {
            return MerkleRootComputation.hashLeaf(addresses[0], chainIds[0]);
        }

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(addresses[i], chainIds[i]);
        }

        // Sort leaves AND addresses/chainIds together (insertion sort)
        for (uint256 i = 1; i < length; i++) {
            bytes32 keyLeaf = leaves[i];
            address keyAddr = addresses[i];
            bytes32 keyChainId = chainIds[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > keyLeaf) {
                leaves[j] = leaves[j - 1];
                addresses[j] = addresses[j - 1];
                chainIds[j] = chainIds[j - 1];
                j--;
            }
            leaves[j] = keyLeaf;
            addresses[j] = keyAddr;
            chainIds[j] = keyChainId;
        }

        return MerkleRootComputation.computeRootFromSorted(leaves);
    }

    /// @notice Compute merkle root for (bytes32, bytes32) entries and sort arrays in-place
    /// @dev Sorts both values and chainIds arrays by their leaf hash (ascending order)
    /// @param values Array of bytes32 values like txHashes (modified in-place)
    /// @param chainIds Array of chain IDs (modified in-place to match sorted values)
    /// @return Merkle root computed from sorted leaves
    function computeBytes32Root(bytes32[] memory values, bytes32[] memory chainIds) internal pure returns (bytes32) {
        uint256 length = values.length;
        if (length == 0) return bytes32(0);
        if (length == 1) {
            return MerkleRootComputation.hashLeaf(values[0], chainIds[0]);
        }

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(values[i], chainIds[i]);
        }

        // Sort leaves AND values/chainIds together (insertion sort)
        for (uint256 i = 1; i < length; i++) {
            bytes32 keyLeaf = leaves[i];
            bytes32 keyValue = values[i];
            bytes32 keyChainId = chainIds[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > keyLeaf) {
                leaves[j] = leaves[j - 1];
                values[j] = values[j - 1];
                chainIds[j] = chainIds[j - 1];
                j--;
            }
            leaves[j] = keyLeaf;
            values[j] = keyValue;
            chainIds[j] = keyChainId;
        }

        return MerkleRootComputation.computeRootFromSorted(leaves);
    }

    /// @notice Sort addresses and chainIds by their leaf hash
    /// @dev Only sorts, does not compute root. Useful when root is computed elsewhere.
    /// @param addresses Array of addresses (modified in-place)
    /// @param chainIds Array of chain IDs (modified in-place)
    function sortAddresses(address[] memory addresses, bytes32[] memory chainIds) internal pure {
        uint256 length = addresses.length;
        if (length <= 1) return;

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(addresses[i], chainIds[i]);
        }

        // Sort leaves AND addresses/chainIds together
        for (uint256 i = 1; i < length; i++) {
            bytes32 keyLeaf = leaves[i];
            address keyAddr = addresses[i];
            bytes32 keyChainId = chainIds[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > keyLeaf) {
                leaves[j] = leaves[j - 1];
                addresses[j] = addresses[j - 1];
                chainIds[j] = chainIds[j - 1];
                j--;
            }
            leaves[j] = keyLeaf;
            addresses[j] = keyAddr;
            chainIds[j] = keyChainId;
        }
    }

    /// @notice Sort bytes32 values and chainIds by their leaf hash
    /// @dev Only sorts, does not compute root. Useful when root is computed elsewhere.
    /// @param values Array of bytes32 values (modified in-place)
    /// @param chainIds Array of chain IDs (modified in-place)
    function sortBytes32Values(bytes32[] memory values, bytes32[] memory chainIds) internal pure {
        uint256 length = values.length;
        if (length <= 1) return;

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(values[i], chainIds[i]);
        }

        // Sort leaves AND values/chainIds together
        for (uint256 i = 1; i < length; i++) {
            bytes32 keyLeaf = leaves[i];
            bytes32 keyValue = values[i];
            bytes32 keyChainId = chainIds[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > keyLeaf) {
                leaves[j] = leaves[j - 1];
                values[j] = values[j - 1];
                chainIds[j] = chainIds[j - 1];
                j--;
            }
            leaves[j] = keyLeaf;
            values[j] = keyValue;
            chainIds[j] = keyChainId;
        }
    }
}

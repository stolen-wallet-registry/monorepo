// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MerkleRootComputation
/// @author Stolen Wallet Registry Team
/// @notice Library for computing Merkle roots from leaf arrays
/// @dev Fully compatible with OpenZeppelin's StandardMerkleTree (JS) and MerkleProof (Solidity).
///
/// LEAF FORMAT (OpenZeppelin Standard):
/// leaf = keccak256(bytes.concat(bytes1(0x00), keccak256(abi.encode(value1, value2))))
///
/// The 0x00 prefix prevents second-preimage attacks by distinguishing leaves from
/// internal nodes. This matches OpenZeppelin merkle-tree JS library exactly.
///
/// TREE ALGORITHM:
/// 1. Sort leaves in ascending order (consistent ordering)
/// 2. Build tree bottom-up, hashing pairs in sorted order (commutative)
/// 3. Odd nodes promoted to next level unchanged
///
/// COMPATIBILITY:
/// - Leaf format matches OpenZeppelin merkle-tree StandardMerkleTree
/// - Tree building matches OZ's commutativeKeccak256
/// - Proofs from OZ JS library verify with MerkleProof.verify
///
/// GAS CONSIDERATIONS:
/// - Insertion sort is O(n²) but acceptable for typical batch sizes (< 1000)
/// - Library functions are `internal`, so they're inlined at compile time
library MerkleRootComputation {
    // ═══════════════════════════════════════════════════════════════════════════
    // LEAF HASH FUNCTIONS (OpenZeppelin StandardMerkleTree Compatible)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute leaf hash for (address, bytes32) pair
    /// @dev Matches OZ StandardMerkleTree.of(values, ['address', 'bytes32'])
    /// @param addr The address value
    /// @param value The bytes32 value (e.g., chainId)
    /// @return The leaf hash in OZ standard format
    function hashLeaf(address addr, bytes32 value) internal pure returns (bytes32) {
        return keccak256(bytes.concat(bytes1(0x00), keccak256(abi.encode(addr, value))));
    }

    /// @notice Compute leaf hash for (bytes32, bytes32) pair
    /// @dev Matches OZ StandardMerkleTree.of(values, ['bytes32', 'bytes32'])
    /// @param value1 First bytes32 value (e.g., txHash)
    /// @param value2 Second bytes32 value (e.g., chainId)
    /// @return The leaf hash in OZ standard format
    function hashLeaf(bytes32 value1, bytes32 value2) internal pure returns (bytes32) {
        return keccak256(bytes.concat(bytes1(0x00), keccak256(abi.encode(value1, value2))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ROOT COMPUTATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute Merkle root from pre-hashed leaves
    /// @dev Leaves array is modified in-place to avoid memory allocation.
    ///      Caller should not rely on leaves array contents after this call.
    /// @param leaves Array of leaf hashes (will be modified in-place)
    /// @return Root hash of the Merkle tree, or bytes32(0) for empty array
    function computeRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        uint256 length = leaves.length;
        if (length == 0) return bytes32(0);
        if (length == 1) return leaves[0];

        // Sort leaves for consistent ordering
        _sortBytes32Array(leaves);

        // Build tree bottom-up
        while (length > 1) {
            uint256 newLength = (length + 1) / 2;
            for (uint256 i = 0; i < newLength; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                if (right < length) {
                    // Hash sorted pair (commutative hashing for OZ compatibility)
                    if (leaves[left] < leaves[right]) {
                        leaves[i] = keccak256(abi.encodePacked(leaves[left], leaves[right]));
                    } else {
                        leaves[i] = keccak256(abi.encodePacked(leaves[right], leaves[left]));
                    }
                } else {
                    // Odd node: promote to next level
                    leaves[i] = leaves[left];
                }
            }
            length = newLength;
        }

        return leaves[0];
    }

    /// @notice Sort bytes32 array in ascending order
    /// @dev Insertion sort - O(n²), suitable for batches < 1000 elements.
    ///      More gas-efficient than quicksort for small arrays due to
    ///      lower constant factors and no recursion overhead.
    /// @param arr Array to sort in-place
    function _sortBytes32Array(bytes32[] memory arr) private pure {
        uint256 n = arr.length;
        for (uint256 i = 1; i < n; i++) {
            bytes32 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }
}

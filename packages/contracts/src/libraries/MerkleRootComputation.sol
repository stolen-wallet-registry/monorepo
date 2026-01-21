// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MerkleRootComputation
/// @author Stolen Wallet Registry Team
/// @notice Library for computing Merkle roots from leaf arrays
/// @dev Uses sorted pair hashing for OpenZeppelin MerkleProof compatibility.
///      OZ only provides verification (MerkleProof.verify) but not root computation.
///      This library fills that gap for on-chain batch validation.
///
/// ALGORITHM:
/// 1. Sort leaves in ascending order (consistent ordering)
/// 2. Build tree bottom-up, hashing pairs in sorted order (commutative)
/// 3. Odd nodes promoted to next level unchanged
///
/// COMPATIBILITY:
/// - Uses same sorted pair hashing as OZ's commutativeKeccak256
/// - Proofs generated for this root will verify with MerkleProof.verify
///
/// GAS CONSIDERATIONS:
/// - Insertion sort is O(n²) but acceptable for typical batch sizes (< 1000)
/// - Library functions are `internal`, so they're inlined at compile time
/// - For very large batches (1000+ entries), consider requiring pre-sorted
///   inputs and validating monotonic order instead of sorting on-chain
library MerkleRootComputation {
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

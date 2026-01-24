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
/// - computeRootFromSorted() requires pre-sorted leaves - O(n) verification
/// - Library functions are `internal`, so they're inlined at compile time
/// - Callers must sort leaves off-chain before submitting to save gas
library MerkleRootComputation {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Thrown when leaves are not sorted in ascending order (for computeRootFromSorted)
    error LeavesNotSorted();

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

    /// @notice Compute Merkle root from PRE-SORTED leaves (O(n) verification)
    /// @dev Reverts if leaves are not sorted in ascending order. Caller must sort off-chain.
    ///      This is significantly more gas-efficient for large batches (>100 entries)
    ///      as it replaces O(n²) insertion sort with O(n) verification.
    /// @param leaves Array of leaf hashes (MUST be sorted ascending, no duplicates)
    /// @return Root hash of the Merkle tree, or bytes32(0) for empty array
    function computeRootFromSorted(bytes32[] memory leaves) internal pure returns (bytes32) {
        uint256 length = leaves.length;
        if (length == 0) return bytes32(0);
        if (length == 1) return leaves[0];

        // Verify sort order O(n) instead of sorting O(n²)
        // Also catches duplicates since we require strictly ascending order
        for (uint256 i = 1; i < length; i++) {
            if (leaves[i - 1] >= leaves[i]) revert LeavesNotSorted();
        }

        // Build tree bottom-up (same algorithm as computeRoot, but no sorting needed)
        while (length > 1) {
            uint256 newLength = (length + 1) / 2;
            for (uint256 i = 0; i < newLength; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                if (right < length) {
                    // Already sorted, so left < right guaranteed
                    leaves[i] = keccak256(abi.encodePacked(leaves[left], leaves[right]));
                } else {
                    // Odd node: promote to next level
                    leaves[i] = leaves[left];
                }
            }
            length = newLength;
        }

        return leaves[0];
    }
}

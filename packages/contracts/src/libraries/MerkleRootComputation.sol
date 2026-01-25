// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MerkleRootComputation
/// @author Stolen Wallet Registry Team
/// @notice Library for computing Merkle roots from leaf arrays
/// @dev Fully compatible with OpenZeppelin's StandardMerkleTree (JS) and MerkleProof (Solidity).
///
/// LEAF FORMAT (OpenZeppelin StandardMerkleTree v1.0.8+):
/// leaf = keccak256(keccak256(abi.encode(value1, value2)))
///
/// The double-keccak256 provides domain separation - leaves use double hash while
/// internal nodes use single hash. This prevents second-preimage attacks.
/// This matches OpenZeppelin merkle-tree JS library v1.0.8+.
///
/// TREE ALGORITHM (Complete Binary Tree - matches OZ StandardMerkleTree):
/// 1. Sort leaves in ascending order (consistent ordering)
/// 2. Create tree array of size 2n-1
/// 3. Place leaves at end of array in REVERSE order
/// 4. Compute internal nodes from right to left: tree[i] = hash(tree[2i+1], tree[2i+2])
///
/// This is NOT the naive bottom-up algorithm that promotes odd nodes.
/// OZ uses a complete binary tree where leaves are placed at specific positions
/// based on tree depth, not sequential pairing.
///
/// COMPATIBILITY:
/// - Leaf format matches OpenZeppelin merkle-tree StandardMerkleTree
/// - Tree structure matches OZ's makeMerkleTree exactly
/// - Proofs from OZ JS library verify with MerkleProof.verify
///
/// GAS CONSIDERATIONS:
/// - computeRootFromSorted() requires pre-sorted leaves - O(n) verification
/// - Library functions are `internal`, so they're inlined at compile time
/// - Allocates 2n-1 array (vs n in naive approach) - acceptable tradeoff for correctness
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
    /// @dev Matches OZ StandardMerkleTree.of(values, ['address', 'bytes32']) v1.0.8+
    /// @param addr The address value
    /// @param value The bytes32 value (e.g., chainId)
    /// @return The leaf hash in OZ standard format (double keccak256, no 0x00 prefix)
    function hashLeaf(address addr, bytes32 value) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(addr, value))));
    }

    /// @notice Compute leaf hash for (bytes32, bytes32) pair
    /// @dev Matches OZ StandardMerkleTree.of(values, ['bytes32', 'bytes32']) v1.0.8+
    /// @param value1 First bytes32 value (e.g., txHash)
    /// @param value2 Second bytes32 value (e.g., chainId)
    /// @return The leaf hash in OZ standard format (double keccak256, no 0x00 prefix)
    function hashLeaf(bytes32 value1, bytes32 value2) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(value1, value2))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Commutative keccak256 hash - smaller value always first
    /// @dev Matches OpenZeppelin's Hashes.commutativeKeccak256 for MerkleProof compatibility
    /// @param a First hash
    /// @param b Second hash
    /// @return Hash of the pair with smaller value first
    function _commutativeKeccak256(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ROOT COMPUTATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute Merkle root from PRE-SORTED leaves (O(n) verification)
    /// @dev Reverts if leaves are not sorted in ascending order. Caller must sort off-chain.
    ///
    ///      ALGORITHM: Matches OpenZeppelin StandardMerkleTree's makeMerkleTree exactly.
    ///      This is a complete binary tree representation where:
    ///      - Tree has size 2n-1 (n leaves + n-1 internal nodes)
    ///      - Leaves placed at end of array in REVERSE order
    ///      - Internal nodes computed right-to-left: tree[i] = hash(tree[2i+1], tree[2i+2])
    ///
    ///      Example for 6 leaves [L0, L1, L2, L3, L4, L5]:
    ///      Tree array indices:    [0]  [1]  [2]  [3]  [4]  [5]  [6]  [7]  [8]  [9]  [10]
    ///      After leaf placement:   -    -    -    -    -   L5   L4   L3   L2   L1   L0
    ///      Tree structure:        root
    ///                            /    \
    ///                          [1]    [2]
    ///                         /  \   /  \
    ///                       [3] [4] [5] [6]=L4
    ///                       /\  /\   |
    ///                      ... ... L5
    ///
    /// @param leaves Array of leaf hashes (MUST be sorted ascending, no duplicates)
    /// @return Root hash of the Merkle tree, or bytes32(0) for empty array
    function computeRootFromSorted(bytes32[] memory leaves) internal pure returns (bytes32) {
        uint256 n = leaves.length;
        if (n == 0) return bytes32(0);
        if (n == 1) return leaves[0];

        // Verify sort order O(n) instead of sorting O(n²)
        // Also catches duplicates since we require strictly ascending order
        for (uint256 i = 1; i < n; i++) {
            if (leaves[i - 1] >= leaves[i]) revert LeavesNotSorted();
        }

        // Build complete binary tree (OZ StandardMerkleTree compatible)
        uint256 treeLength = 2 * n - 1;
        bytes32[] memory tree = new bytes32[](treeLength);

        // Place leaves at end in REVERSE order (matches OZ StandardMerkleTree.makeMerkleTree)
        // OZ: for (const [i, leaf] of leaves.entries()) { tree[tree.length - 1 - i] = leaf; }
        for (uint256 i = 0; i < n; i++) {
            tree[treeLength - 1 - i] = leaves[i];
        }

        // Compute internal nodes from right to left
        // Internal nodes are at indices 0 to n-2
        // OZ: for (let i = tree.length - 1 - leaves.length; i >= 0; i--) {
        //       tree[i] = hashPair(tree[2*i + 1], tree[2*i + 2]);
        //     }
        for (uint256 i = n - 2;;) {
            tree[i] = _commutativeKeccak256(tree[2 * i + 1], tree[2 * i + 2]);
            if (i == 0) break;
            unchecked {
                i--;
            }
        }

        return tree[0];
    }
}

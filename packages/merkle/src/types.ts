/**
 * Types for Merkle tree operations.
 */

import type { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Address, Hex } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Entry for the Stolen Wallet Registry.
 * Leaf format: (address, chainId) where chainId is CAIP-2 as bytes32.
 */
export interface WalletEntry {
  address: Address;
  /** CAIP-2 chain identifier as bytes32 hash */
  chainId: Hex;
}

/**
 * Entry for the Stolen Transaction Registry.
 * Leaf format: (txHash, chainId) where chainId is CAIP-2 as bytes32.
 */
export interface TransactionEntry {
  txHash: Hex;
  /** CAIP-2 chain identifier as bytes32 hash */
  chainId: Hex;
}

/**
 * Entry for the Fraudulent Contract Registry.
 * Leaf format: (address, chainId) where chainId is CAIP-2 as bytes32.
 */
export interface ContractEntry {
  address: Address;
  /** CAIP-2 chain identifier as bytes32 hash */
  chainId: Hex;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of building a Merkle tree.
 */
export interface MerkleTreeResult<T> {
  /** Merkle root of the tree */
  root: Hex;
  /** The OpenZeppelin StandardMerkleTree instance */
  tree: StandardMerkleTree<[string, string]>;
  /** Original entries used to build the tree */
  entries: T[];
  /** Number of leaves in the tree */
  leafCount: number;
}

/**
 * Serialized tree format for storage/transport.
 * Compatible with OpenZeppelin StandardMerkleTree.dump()/load().
 */
export interface SerializedTree {
  format: 'standard-v1';
  tree: [string, string][];
  values: {
    value: [string, string];
    treeIndex: number;
  }[];
  leafEncoding: string[];
}

/**
 * Hook to build and manage Merkle trees for transaction batches.
 *
 * Uses a custom implementation that matches the contract's leaf format:
 * leaf = keccak256(abi.encodePacked(txHash, chainId))
 *
 * Note: We don't use OpenZeppelin's StandardMerkleTree because it uses
 * double-hashing for security, which doesn't match our contract.
 */

import { useMemo } from 'react';
import { keccak256, encodePacked } from 'viem';
import type { Hash } from '@/lib/types/ethereum';
import { chainIdToCAIP2 } from '@/lib/caip';
import { logger } from '@/lib/logger';

export interface TransactionLeaf {
  txHash: Hash;
  chainId: number;
}

export interface MerkleTreeData {
  /** Merkle root of the tree */
  root: Hash;
  /** Number of transactions in the tree */
  count: number;
  /** The transaction hashes (for contract call) */
  txHashes: Hash[];
  /** The CAIP-2 chain IDs as bytes32 (for contract call) */
  chainIds: Hash[];
  /** Get proof for a specific transaction by index */
  getProof: (index: number) => Hash[];
  /** Get proof for a specific transaction by hash and chain */
  getProofByTx: (txHash: Hash, chainId: number) => Hash[];
}

/**
 * Compute a single leaf for the Merkle tree.
 * Matches contract: keccak256(abi.encodePacked(txHash, chainId))
 */
function computeLeaf(txHash: Hash, caip2ChainId: Hash): Hash {
  return keccak256(encodePacked(['bytes32', 'bytes32'], [txHash, caip2ChainId]));
}

/**
 * Hash two nodes together for the Merkle tree.
 * Sorts nodes to ensure consistent ordering (like OpenZeppelin).
 */
function hashPair(a: Hash, b: Hash): Hash {
  // Sort to ensure consistent ordering regardless of input order
  const [left, right] = a < b ? [a, b] : [b, a];
  return keccak256(encodePacked(['bytes32', 'bytes32'], [left, right]));
}

/**
 * Build a Merkle tree from leaves and return root + proof generation function.
 */
function buildTree(leaves: Hash[]): { root: Hash; getProof: (index: number) => Hash[] } {
  if (leaves.length === 0) {
    throw new Error('Cannot build tree with no leaves');
  }

  if (leaves.length === 1) {
    return {
      root: leaves[0],
      getProof: () => [],
    };
  }

  // Build tree bottom-up, storing all levels
  const levels: Hash[][] = [leaves];
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: Hash[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
      } else {
        // Odd number of nodes: promote the last one
        nextLevel.push(currentLevel[i]);
      }
    }

    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = currentLevel[0];

  // Function to generate proof for a leaf at given index
  const getProof = (index: number): Hash[] => {
    if (index < 0 || index >= leaves.length) {
      return [];
    }

    const proof: Hash[] = [];
    let idx = index;

    for (let level = 0; level < levels.length - 1; level++) {
      const levelNodes = levels[level];
      const isLeft = idx % 2 === 0;
      const siblingIdx = isLeft ? idx + 1 : idx - 1;

      if (siblingIdx < levelNodes.length) {
        proof.push(levelNodes[siblingIdx]);
      }

      // Move to parent index
      idx = Math.floor(idx / 2);
    }

    return proof;
  };

  return { root, getProof };
}

/**
 * Build a Merkle tree from transaction leaves.
 *
 * @param transactions - Array of transactions with hash and chain ID
 * @returns Merkle tree data or null if empty
 */
export function buildMerkleTree(transactions: TransactionLeaf[]): MerkleTreeData | null {
  if (transactions.length === 0) {
    return null;
  }

  try {
    // Convert chain IDs to CAIP-2 hashes
    const caip2ChainIds = transactions.map((tx) => chainIdToCAIP2(tx.chainId));

    // Compute leaves
    const leaves = transactions.map((tx, i) => computeLeaf(tx.txHash, caip2ChainIds[i]));

    // Build tree
    const { root, getProof } = buildTree(leaves);

    logger.store.debug('Merkle tree built', {
      root,
      count: transactions.length,
    });

    return {
      root,
      count: transactions.length,
      txHashes: transactions.map((tx) => tx.txHash),
      chainIds: caip2ChainIds,
      getProof,
      getProofByTx: (txHash: Hash, chainId: number) => {
        const caip2 = chainIdToCAIP2(chainId);
        const targetLeaf = computeLeaf(txHash, caip2);
        const index = leaves.findIndex((leaf) => leaf === targetLeaf);
        if (index === -1) {
          logger.store.warn('Transaction not found in tree', { txHash, chainId });
          return [];
        }
        return getProof(index);
      },
    };
  } catch (error) {
    logger.store.error('Failed to build Merkle tree', {
      error: error instanceof Error ? error.message : String(error),
      transactionCount: transactions.length,
    });
    return null;
  }
}

/**
 * Hook to manage Merkle tree state for selected transactions.
 *
 * @param transactions - Array of transactions to include in the tree
 * @returns Merkle tree data including root, proofs, and formatted arrays for contract
 */
export function useMerkleTree(transactions: TransactionLeaf[]): MerkleTreeData | null {
  const tree = useMemo(() => {
    return buildMerkleTree(transactions);
  }, [transactions]);

  return tree;
}

/**
 * Hook to get a proof for a specific transaction.
 *
 * @param tree - The Merkle tree data
 * @param txHash - Transaction hash to prove
 * @param chainId - Chain ID where transaction occurred
 * @returns Merkle proof as array of bytes32
 */
export function useMerkleProof(
  tree: MerkleTreeData | null,
  txHash: Hash | undefined,
  chainId: number | undefined
): Hash[] {
  return useMemo(() => {
    if (!tree || !txHash || chainId === undefined) {
      return [];
    }
    return tree.getProofByTx(txHash, chainId);
  }, [tree, txHash, chainId]);
}

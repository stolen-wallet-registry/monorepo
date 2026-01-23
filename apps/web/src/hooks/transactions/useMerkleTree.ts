/**
 * Hook to build and manage Merkle trees for transaction batches.
 *
 * Uses @swr/merkle which wraps OpenZeppelin StandardMerkleTree for
 * consistent behavior with contracts and CLI.
 */

import { useMemo } from 'react';
import type { Hash } from '@/lib/types/ethereum';
import { chainIdToBytes32 } from '@swr/caip';
import {
  buildTransactionMerkleTree,
  getTransactionProof,
  type TransactionEntry,
} from '@swr/merkle';
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
  /** The transaction hashes (for contract call) - in sorted leaf order */
  txHashes: Hash[];
  /** The CAIP-2 chain IDs as bytes32 (for contract call) - in sorted leaf order */
  chainIds: Hash[];
  /** Get proof for a specific transaction by index */
  getProof: (index: number) => Hash[];
  /** Get proof for a specific transaction by hash and chain */
  getProofByTx: (txHash: Hash, chainId: number) => Hash[];
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
    // Convert to @swr/merkle format (chain ID as bytes32)
    const entries: TransactionEntry[] = transactions.map((tx) => ({
      txHash: tx.txHash,
      chainId: chainIdToBytes32(tx.chainId),
    }));

    // Build tree using @swr/merkle (uses OZ StandardMerkleTree)
    const { root, tree, leafCount } = buildTransactionMerkleTree(entries);

    // Get the sorted order from the tree for contract calls
    // OZ StandardMerkleTree sorts leaves internally
    const sortedEntries: TransactionEntry[] = [];
    for (const [, value] of tree.entries()) {
      sortedEntries.push({
        txHash: value[0] as Hash,
        chainId: value[1] as Hash,
      });
    }

    const sortedTxHashes = sortedEntries.map((e) => e.txHash);
    const sortedChainIds = sortedEntries.map((e) => e.chainId);

    logger.store.debug('Merkle tree built', {
      root,
      count: leafCount,
    });

    return {
      root,
      count: leafCount,
      txHashes: sortedTxHashes,
      chainIds: sortedChainIds,
      getProof: (index: number): Hash[] => {
        if (index < 0 || index >= sortedEntries.length) {
          return [];
        }
        try {
          return getTransactionProof(
            tree,
            sortedEntries[index].txHash,
            sortedEntries[index].chainId
          );
        } catch {
          return [];
        }
      },
      getProofByTx: (txHash: Hash, chainId: number): Hash[] => {
        const chainIdBytes32 = chainIdToBytes32(chainId);
        try {
          return getTransactionProof(tree, txHash, chainIdBytes32);
        } catch {
          logger.store.warn('Transaction not found in tree', { txHash, chainId });
          return [];
        }
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

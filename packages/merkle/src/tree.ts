/**
 * Merkle tree building utilities.
 *
 * Uses OpenZeppelin StandardMerkleTree for consistent behavior with contracts.
 *
 * IMPORTANT: These functions sort entries by leaf hash before building the tree.
 * This ensures the returned `entries` array is in the correct order for contract submission.
 * The on-chain contracts require leaves to be pre-sorted (ascending order by leaf hash).
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Hex } from 'viem';
import type { WalletEntry, TransactionEntry, ContractEntry, MerkleTreeResult } from './types';
import { sortWalletEntries, sortTransactionEntries, sortContractEntries } from './sort';

/**
 * Build a Merkle tree for wallet entries.
 *
 * IMPORTANT: Entries are sorted by leaf hash before building the tree.
 * The returned `entries` array is in sorted order, matching what the contract expects.
 *
 * @param entries - Array of wallet entries (can be in any order)
 * @returns Merkle tree result with root, tree instance, and SORTED entries
 * @throws If entries array is empty
 *
 * @example
 * ```ts
 * const entries = [
 *   { address: '0x123...', chainId: chainIdToBytes32(8453) },
 *   { address: '0x456...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree, entries: sortedEntries } = buildWalletMerkleTree(entries);
 *
 * // Use sortedEntries for contract submission:
 * const wallets = sortedEntries.map(e => e.address);
 * const chainIds = sortedEntries.map(e => e.chainId);
 * contract.registerBatchAsOperator(root, chainId, wallets, chainIds);
 * ```
 */
export function buildWalletMerkleTree(entries: WalletEntry[]): MerkleTreeResult<WalletEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  // Sort entries by leaf hash (required for on-chain verification)
  const sortedEntries = sortWalletEntries(entries);

  // Build values array: [address, chainId]
  const values = sortedEntries.map((e) => [e.address, e.chainId] as [string, string]);

  // Create tree with OpenZeppelin's standard (sorted leaves)
  const tree = StandardMerkleTree.of(values, ['address', 'bytes32']);

  return {
    root: tree.root as Hex,
    tree,
    entries: sortedEntries,
    leafCount: sortedEntries.length,
  };
}

/**
 * Build a Merkle tree for transaction entries.
 *
 * IMPORTANT: Entries are sorted by leaf hash before building the tree.
 * The returned `entries` array is in sorted order, matching what the contract expects.
 *
 * @param entries - Array of transaction entries (can be in any order)
 * @returns Merkle tree result with root, tree instance, and SORTED entries
 * @throws If entries array is empty
 *
 * @example
 * ```ts
 * const entries = [
 *   { txHash: '0xabc...', chainId: chainIdToBytes32(8453) },
 *   { txHash: '0xdef...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree, entries: sortedEntries } = buildTransactionMerkleTree(entries);
 *
 * // Use sortedEntries for contract submission:
 * const txHashes = sortedEntries.map(e => e.txHash);
 * const chainIds = sortedEntries.map(e => e.chainId);
 * contract.registerBatchAsOperator(root, chainId, txHashes, chainIds);
 * ```
 */
export function buildTransactionMerkleTree(
  entries: TransactionEntry[]
): MerkleTreeResult<TransactionEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  // Sort entries by leaf hash (required for on-chain verification)
  const sortedEntries = sortTransactionEntries(entries);

  const values = sortedEntries.map((e) => [e.txHash, e.chainId] as [string, string]);
  const tree = StandardMerkleTree.of(values, ['bytes32', 'bytes32']);

  return {
    root: tree.root as Hex,
    tree,
    entries: sortedEntries,
    leafCount: sortedEntries.length,
  };
}

/**
 * Build a Merkle tree for contract entries.
 *
 * IMPORTANT: Entries are sorted by leaf hash before building the tree.
 * The returned `entries` array is in sorted order, matching what the contract expects.
 *
 * @param entries - Array of contract entries (can be in any order)
 * @returns Merkle tree result with root, tree instance, and SORTED entries
 * @throws If entries array is empty
 *
 * @example
 * ```ts
 * const entries = [
 *   { address: '0x789...', chainId: chainIdToBytes32(8453) },
 *   { address: '0xabc...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree, entries: sortedEntries } = buildContractMerkleTree(entries);
 *
 * // Use sortedEntries for contract submission:
 * const addresses = sortedEntries.map(e => e.address);
 * const chainIds = sortedEntries.map(e => e.chainId);
 * contract.registerBatch(root, chainId, addresses, chainIds);
 * ```
 */
export function buildContractMerkleTree(entries: ContractEntry[]): MerkleTreeResult<ContractEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  // Sort entries by leaf hash (required for on-chain verification)
  const sortedEntries = sortContractEntries(entries);

  const values = sortedEntries.map((e) => [e.address, e.chainId] as [string, string]);
  const tree = StandardMerkleTree.of(values, ['address', 'bytes32']);

  return {
    root: tree.root as Hex,
    tree,
    entries: sortedEntries,
    leafCount: sortedEntries.length,
  };
}

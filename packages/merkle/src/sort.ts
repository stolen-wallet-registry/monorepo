/**
 * Sorting utilities for registry entries.
 *
 * The on-chain contracts now require leaves to be pre-sorted (ascending order by leaf hash)
 * for gas efficiency. These utilities sort entries by their computed leaf hash to match
 * the expected on-chain order.
 *
 * @example
 * ```ts
 * import { sortWalletEntries, buildWalletMerkleTree } from '@swr/merkle';
 *
 * const entries = [
 *   { address: '0xAAA...', chainId: '0x...' },
 *   { address: '0xBBB...', chainId: '0x...' },
 * ];
 *
 * // Sort entries before building tree and submitting to contract
 * const sortedEntries = sortWalletEntries(entries);
 * const { root } = buildWalletMerkleTree(sortedEntries);
 *
 * // Use sortedEntries.map(e => e.address) and sortedEntries.map(e => e.chainId)
 * // when calling contract.registerBatch(...)
 * ```
 */

import type { Address, Hex } from 'viem';
import type { WalletEntry, TransactionEntry, ContractEntry } from './types';
import { computeWalletLeaf, computeTransactionLeaf, computeContractLeaf } from './leaf';

/**
 * Sort wallet entries by their leaf hash (ascending order).
 *
 * IMPORTANT: Call this before submitting entries to the contract.
 * The contract requires entries to produce leaves in ascending hash order.
 *
 * @param entries - Unsorted wallet entries
 * @returns New array with entries sorted by leaf hash
 *
 * @example
 * ```ts
 * const entries = [wallet1, wallet2, wallet3];
 * const sorted = sortWalletEntries(entries);
 *
 * // When calling contract:
 * const wallets = sorted.map(e => e.address);
 * const chainIds = sorted.map(e => e.chainId);
 * contract.registerBatchAsOperator(merkleRoot, chainId, wallets, chainIds);
 * ```
 */
export function sortWalletEntries(entries: WalletEntry[]): WalletEntry[] {
  // Create array of entries with their leaf hashes
  const entriesWithLeaves = entries.map((entry) => ({
    entry,
    leaf: computeWalletLeaf(entry.address, entry.chainId),
  }));

  // Sort by leaf hash (ascending)
  entriesWithLeaves.sort((a, b) => {
    if (a.leaf < b.leaf) return -1;
    if (a.leaf > b.leaf) return 1;
    return 0;
  });

  // Return sorted entries
  return entriesWithLeaves.map((e) => e.entry);
}

/**
 * Sort transaction entries by their leaf hash (ascending order).
 *
 * IMPORTANT: Call this before submitting entries to the contract.
 * The contract requires entries to produce leaves in ascending hash order.
 *
 * @param entries - Unsorted transaction entries
 * @returns New array with entries sorted by leaf hash
 *
 * @example
 * ```ts
 * const entries = [tx1, tx2, tx3];
 * const sorted = sortTransactionEntries(entries);
 *
 * // When calling contract:
 * const txHashes = sorted.map(e => e.txHash);
 * const chainIds = sorted.map(e => e.chainId);
 * contract.registerBatchAsOperator(merkleRoot, chainId, txHashes, chainIds);
 * ```
 */
export function sortTransactionEntries(entries: TransactionEntry[]): TransactionEntry[] {
  const entriesWithLeaves = entries.map((entry) => ({
    entry,
    leaf: computeTransactionLeaf(entry.txHash, entry.chainId),
  }));

  entriesWithLeaves.sort((a, b) => {
    if (a.leaf < b.leaf) return -1;
    if (a.leaf > b.leaf) return 1;
    return 0;
  });

  return entriesWithLeaves.map((e) => e.entry);
}

/**
 * Sort contract entries by their leaf hash (ascending order).
 *
 * IMPORTANT: Call this before submitting entries to the contract.
 * The contract requires entries to produce leaves in ascending hash order.
 *
 * @param entries - Unsorted contract entries
 * @returns New array with entries sorted by leaf hash
 *
 * @example
 * ```ts
 * const entries = [contract1, contract2, contract3];
 * const sorted = sortContractEntries(entries);
 *
 * // When calling contract:
 * const addresses = sorted.map(e => e.address);
 * const chainIds = sorted.map(e => e.chainId);
 * contract.registerBatch(merkleRoot, chainId, addresses, chainIds);
 * ```
 */
export function sortContractEntries(entries: ContractEntry[]): ContractEntry[] {
  const entriesWithLeaves = entries.map((entry) => ({
    entry,
    leaf: computeContractLeaf(entry.address, entry.chainId),
  }));

  entriesWithLeaves.sort((a, b) => {
    if (a.leaf < b.leaf) return -1;
    if (a.leaf > b.leaf) return 1;
    return 0;
  });

  return entriesWithLeaves.map((e) => e.entry);
}

/**
 * Extract sorted arrays for contract submission from wallet entries.
 *
 * Convenience function that sorts entries and returns separate arrays
 * ready for contract call.
 *
 * @param entries - Wallet entries to sort and extract
 * @returns Object with sorted addresses and chainIds arrays
 */
export function getSortedWalletArrays(entries: WalletEntry[]): {
  sortedEntries: WalletEntry[];
  addresses: Address[];
  chainIds: Hex[];
} {
  const sortedEntries = sortWalletEntries(entries);
  return {
    sortedEntries,
    addresses: sortedEntries.map((e) => e.address),
    chainIds: sortedEntries.map((e) => e.chainId),
  };
}

/**
 * Extract sorted arrays for contract submission from transaction entries.
 */
export function getSortedTransactionArrays(entries: TransactionEntry[]): {
  sortedEntries: TransactionEntry[];
  txHashes: Hex[];
  chainIds: Hex[];
} {
  const sortedEntries = sortTransactionEntries(entries);
  return {
    sortedEntries,
    txHashes: sortedEntries.map((e) => e.txHash),
    chainIds: sortedEntries.map((e) => e.chainId),
  };
}

/**
 * Extract sorted arrays for contract submission from contract entries.
 */
export function getSortedContractArrays(entries: ContractEntry[]): {
  sortedEntries: ContractEntry[];
  addresses: Address[];
  chainIds: Hex[];
} {
  const sortedEntries = sortContractEntries(entries);
  return {
    sortedEntries,
    addresses: sortedEntries.map((e) => e.address),
    chainIds: sortedEntries.map((e) => e.chainId),
  };
}

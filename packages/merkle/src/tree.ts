/**
 * Merkle tree building utilities.
 *
 * Uses OpenZeppelin StandardMerkleTree for consistent behavior with contracts.
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Hex } from 'viem';
import type { WalletEntry, TransactionEntry, ContractEntry, MerkleTreeResult } from './types';

/**
 * Build a Merkle tree for wallet entries.
 *
 * @param entries - Array of wallet entries
 * @returns Merkle tree result with root, tree instance, and entries
 * @throws If entries array is empty
 *
 * @example
 * ```ts
 * const entries = [
 *   { address: '0x123...', chainId: chainIdToBytes32(8453) },
 *   { address: '0x456...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree } = buildWalletMerkleTree(entries);
 * ```
 */
export function buildWalletMerkleTree(entries: WalletEntry[]): MerkleTreeResult<WalletEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  // Build values array: [address, chainId]
  const values = entries.map((e) => [e.address, e.chainId] as [string, string]);

  // Create tree with OpenZeppelin's standard (sorted leaves)
  const tree = StandardMerkleTree.of(values, ['address', 'bytes32']);

  return {
    root: tree.root as Hex,
    tree,
    entries,
    leafCount: entries.length,
  };
}

/**
 * Build a Merkle tree for transaction entries.
 *
 * @param entries - Array of transaction entries
 * @returns Merkle tree result with root, tree instance, and entries
 * @throws If entries array is empty
 *
 * @example
 * ```ts
 * const entries = [
 *   { txHash: '0xabc...', chainId: chainIdToBytes32(8453) },
 *   { txHash: '0xdef...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree } = buildTransactionMerkleTree(entries);
 * ```
 */
export function buildTransactionMerkleTree(
  entries: TransactionEntry[]
): MerkleTreeResult<TransactionEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  const values = entries.map((e) => [e.txHash, e.chainId] as [string, string]);
  const tree = StandardMerkleTree.of(values, ['bytes32', 'bytes32']);

  return {
    root: tree.root as Hex,
    tree,
    entries,
    leafCount: entries.length,
  };
}

/**
 * Build a Merkle tree for contract entries.
 *
 * @param entries - Array of contract entries
 * @returns Merkle tree result with root, tree instance, and entries
 * @throws If entries array is empty
 *
 * @example
 * ```ts
 * const entries = [
 *   { address: '0x789...', chainId: chainIdToBytes32(8453) },
 *   { address: '0xabc...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree } = buildContractMerkleTree(entries);
 * ```
 */
export function buildContractMerkleTree(entries: ContractEntry[]): MerkleTreeResult<ContractEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  const values = entries.map((e) => [e.address, e.chainId] as [string, string]);
  const tree = StandardMerkleTree.of(values, ['address', 'bytes32']);

  return {
    root: tree.root as Hex,
    tree,
    entries,
    leafCount: entries.length,
  };
}

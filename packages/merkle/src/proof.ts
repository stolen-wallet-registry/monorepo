/**
 * Merkle proof retrieval utilities.
 */

import type { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Hex, Address } from 'viem';

/**
 * Get Merkle proof for a wallet entry.
 *
 * @param tree - The StandardMerkleTree instance
 * @param address - Wallet address to prove
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Array of proof hashes
 * @throws If entry not found in tree
 *
 * @example
 * ```ts
 * const { tree } = buildWalletMerkleTree(entries);
 * const proof = getWalletProof(tree, '0x123...', chainIdToBytes32(8453));
 * ```
 */
export function getWalletProof(
  tree: StandardMerkleTree<[string, string]>,
  address: Address,
  chainId: Hex
): Hex[] {
  const normalizedAddress = address.toLowerCase();
  const normalizedChainId = chainId.toLowerCase();

  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === normalizedAddress && v[1].toLowerCase() === normalizedChainId) {
      return tree.getProof(i) as Hex[];
    }
  }
  throw new Error(`Entry not found: ${address} on chain ${chainId}`);
}

/**
 * Get Merkle proof for a transaction entry.
 *
 * @param tree - The StandardMerkleTree instance
 * @param txHash - Transaction hash to prove
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Array of proof hashes
 * @throws If entry not found in tree
 *
 * @example
 * ```ts
 * const { tree } = buildTransactionMerkleTree(entries);
 * const proof = getTransactionProof(tree, '0xabc...', chainIdToBytes32(8453));
 * ```
 */
export function getTransactionProof(
  tree: StandardMerkleTree<[string, string]>,
  txHash: Hex,
  chainId: Hex
): Hex[] {
  const normalizedTxHash = txHash.toLowerCase();
  const normalizedChainId = chainId.toLowerCase();

  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === normalizedTxHash && v[1].toLowerCase() === normalizedChainId) {
      return tree.getProof(i) as Hex[];
    }
  }
  throw new Error(`Entry not found: ${txHash} on chain ${chainId}`);
}

/**
 * Get Merkle proof for a contract entry.
 *
 * @param tree - The StandardMerkleTree instance
 * @param address - Contract address to prove
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Array of proof hashes
 * @throws If entry not found in tree
 *
 * @example
 * ```ts
 * const { tree } = buildContractMerkleTree(entries);
 * const proof = getContractProof(tree, '0x789...', chainIdToBytes32(8453));
 * ```
 */
export function getContractProof(
  tree: StandardMerkleTree<[string, string]>,
  address: Address,
  chainId: Hex
): Hex[] {
  const normalizedAddress = address.toLowerCase();
  const normalizedChainId = chainId.toLowerCase();

  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === normalizedAddress && v[1].toLowerCase() === normalizedChainId) {
      return tree.getProof(i) as Hex[];
    }
  }
  throw new Error(`Entry not found: ${address} on chain ${chainId}`);
}

/**
 * @swr/merkle - Merkle tree utilities for SWR registry operations.
 *
 * Provides consistent Merkle tree building and proof generation using
 * OpenZeppelin's StandardMerkleTree. Ensures CLI and web produce
 * identical roots and proofs that match on-chain verification.
 *
 * @example
 * ```typescript
 * import {
 *   buildTransactionMerkleTree,
 *   getTransactionProof,
 *   computeTransactionLeaf,
 *   serializeTree,
 *   type TransactionEntry,
 * } from '@swr/merkle';
 * import { chainIdToBytes32 } from '@swr/caip';
 *
 * // Build tree from entries
 * const entries: TransactionEntry[] = [
 *   { txHash: '0xabc...', chainId: chainIdToBytes32(8453) },
 *   { txHash: '0xdef...', chainId: chainIdToBytes32(1) },
 * ];
 * const { root, tree } = buildTransactionMerkleTree(entries);
 *
 * // Get proof for a specific entry
 * const proof = getTransactionProof(tree, '0xabc...', chainIdToBytes32(8453));
 *
 * // Serialize for storage
 * const json = serializeTree(tree);
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type {
  WalletEntry,
  TransactionEntry,
  ContractEntry,
  MerkleTreeResult,
  SerializedTree,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// TREE BUILDING
// ═══════════════════════════════════════════════════════════════════════════

export { buildWalletMerkleTree, buildTransactionMerkleTree, buildContractMerkleTree } from './tree';

// ═══════════════════════════════════════════════════════════════════════════
// PROOF RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════

export { getWalletProof, getTransactionProof, getContractProof } from './proof';

// ═══════════════════════════════════════════════════════════════════════════
// LEAF COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

export {
  computeLeaf,
  computeWalletLeaf,
  computeTransactionLeaf,
  computeTransactionLeafFromChainId,
  computeContractLeaf,
} from './leaf';

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export { serializeTree, deserializeTree } from './serialize';

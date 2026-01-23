/**
 * Merkle tree utilities for the CLI.
 *
 * All functions re-exported from @swr/merkle for consistency.
 * This ensures CLI produces roots and proofs that match the web app
 * and on-chain verification.
 */

// Re-export everything from @swr/merkle
export {
  // Types
  type WalletEntry,
  type TransactionEntry,
  type ContractEntry,
  type MerkleTreeResult,
  type SerializedTree,
  // Tree building
  buildWalletMerkleTree,
  buildTransactionMerkleTree,
  buildContractMerkleTree,
  // Proof retrieval
  getWalletProof,
  getTransactionProof,
  getContractProof,
  // Leaf computation
  computeLeaf,
  computeWalletLeaf,
  computeTransactionLeaf,
  computeTransactionLeafFromChainId,
  computeContractLeaf,
  // Serialization
  serializeTree,
  deserializeTree,
} from '@swr/merkle';

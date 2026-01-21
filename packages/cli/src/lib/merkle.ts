import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Address, Hex } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WalletEntry {
  address: Address;
  chainId: Hex; // CAIP-2 as bytes32
}

export interface TransactionEntry {
  txHash: Hex;
  chainId: Hex;
}

export interface ContractEntry {
  address: Address;
  chainId: Hex;
}

export interface MerkleResult<T> {
  root: Hex;
  tree: StandardMerkleTree<[string, string]>;
  entries: T[];
  leafCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET MERKLE TREE
// ═══════════════════════════════════════════════════════════════════════════

export function buildWalletMerkleTree(entries: WalletEntry[]): MerkleResult<WalletEntry> {
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

export function getWalletProof(
  tree: StandardMerkleTree<[string, string]>,
  address: Address,
  chainId: Hex
): Hex[] {
  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === address.toLowerCase() && v[1] === chainId) {
      return tree.getProof(i) as Hex[];
    }
  }
  throw new Error(`Entry not found: ${address} on chain ${chainId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION MERKLE TREE
// ═══════════════════════════════════════════════════════════════════════════

export function buildTransactionMerkleTree(
  entries: TransactionEntry[]
): MerkleResult<TransactionEntry> {
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

export function getTransactionProof(
  tree: StandardMerkleTree<[string, string]>,
  txHash: Hex,
  chainId: Hex
): Hex[] {
  for (const [i, v] of tree.entries()) {
    if (v[0] === txHash && v[1] === chainId) {
      return tree.getProof(i) as Hex[];
    }
  }
  throw new Error(`Entry not found: ${txHash} on chain ${chainId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT MERKLE TREE
// ═══════════════════════════════════════════════════════════════════════════

export function buildContractMerkleTree(entries: ContractEntry[]): MerkleResult<ContractEntry> {
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

export function getContractProof(
  tree: StandardMerkleTree<[string, string]>,
  address: Address,
  chainId: Hex
): Hex[] {
  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === address.toLowerCase() && v[1] === chainId) {
      return tree.getProof(i) as Hex[];
    }
  }
  throw new Error(`Entry not found: ${address} on chain ${chainId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export function serializeTree(tree: StandardMerkleTree<[string, string]>): string {
  return JSON.stringify(tree.dump(), null, 2);
}

export function deserializeTree(json: string): StandardMerkleTree<[string, string]> {
  return StandardMerkleTree.load(JSON.parse(json));
}

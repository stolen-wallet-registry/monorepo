/**
 * Merkle leaf computation utilities.
 *
 * Uses OpenZeppelin StandardMerkleTree v1.0.8+ leaf format to match contracts:
 *   leaf = keccak256(keccak256(abi.encode(value1, value2)))
 *
 * ## Why double keccak256?
 *
 * The double-keccak256 provides domain separation for second-preimage attack defense.
 * Leaves use double hash while internal nodes use single hash:
 *   leaf = keccak256(keccak256(abi.encode(value)))
 *   node = keccak256(leftChild || rightChild)
 *
 * This ensures leaves and internal nodes are cryptographically distinguishable.
 * Note: OZ v1.0.8+ removed the 0x00 prefix in favor of double-hashing.
 *
 * @see https://github.com/OpenZeppelin/merkle-tree
 */

import { keccak256, encodeAbiParameters, type Hex, type Address } from 'viem';
import { chainIdToBytes32 } from '@swr/caip';

/**
 * Internal helper for address-based leaf computation.
 * Used by both wallet and contract registries which share the same format.
 * Matches OZ StandardMerkleTree v1.0.8+ format: keccak256(keccak256(abi.encode(value)))
 */
function computeAddressLeaf(address: Address, chainId: Hex): Hex {
  const innerHash = keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [address, chainId])
  );
  return keccak256(innerHash);
}

/**
 * Compute a Merkle tree leaf for a wallet entry.
 * Matches contract's leaf format: (address, bytes32)
 *
 * @param address - Wallet address
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Merkle leaf hash (OZ standard format)
 */
export function computeWalletLeaf(address: Address, chainId: Hex): Hex {
  return computeAddressLeaf(address, chainId);
}

/**
 * Compute a Merkle tree leaf for a transaction entry.
 * Uses OpenZeppelin StandardMerkleTree v1.0.8+ format matching MerkleRootComputation.sol:
 *   leaf = keccak256(keccak256(abi.encode(txHash, chainId)))
 *
 * @param txHash - Transaction hash
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Merkle leaf hash (OZ standard format)
 *
 * @example
 * ```ts
 * const leaf = computeTransactionLeaf(txHash, chainIdToBytes32(8453));
 * ```
 */
export function computeTransactionLeaf(txHash: Hex, chainId: Hex): Hex {
  const innerHash = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [txHash, chainId])
  );
  return keccak256(innerHash);
}

/**
 * Compute a Merkle tree leaf from transaction hash and numeric chain ID.
 * Convenience function that converts chain ID to CAIP-2 bytes32 first.
 *
 * @param txHash - Transaction hash
 * @param chainId - EIP-155 chain ID number
 * @returns Merkle leaf hash
 *
 * @example
 * ```ts
 * const leaf = computeTransactionLeafFromChainId(txHash, 8453);
 * ```
 */
export function computeTransactionLeafFromChainId(txHash: Hex, chainId: number): Hex {
  const caip2Hash = chainIdToBytes32(chainId);
  return computeTransactionLeaf(txHash, caip2Hash);
}

/**
 * Compute a Merkle tree leaf for a contract entry.
 * Matches contract's leaf format: (address, bytes32)
 *
 * @param address - Contract address
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Merkle leaf hash (OZ standard format)
 */
export function computeContractLeaf(address: Address, chainId: Hex): Hex {
  return computeAddressLeaf(address, chainId);
}

/**
 * Generic leaf computation for any (bytes32, bytes32) tuple.
 * Uses OZ StandardMerkleTree v1.0.8+ format: keccak256(keccak256(abi.encode(value)))
 *
 * @param value1 - First value (txHash or address as bytes32)
 * @param value2 - Second value (chainId as bytes32)
 * @returns Merkle leaf hash
 */
export function computeLeaf(value1: Hex, value2: Hex): Hex {
  const innerHash = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [value1, value2])
  );
  return keccak256(innerHash);
}

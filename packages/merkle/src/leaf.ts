/**
 * Merkle leaf computation utilities.
 *
 * Uses OpenZeppelin StandardMerkleTree leaf format to match contracts:
 *   leaf = keccak256(bytes.concat(0x00, keccak256(abi.encode(value1, value2))))
 *
 * ## Why the 0x00 prefix?
 *
 * The 0x00 prefix is OpenZeppelin's defense against second-preimage attacks.
 * In a Merkle tree, internal nodes are computed as:
 *   node = keccak256(leftChild || rightChild)
 *
 * Without domain separation, an attacker could craft leaf data that equals
 * a valid internal node hash, potentially forging proofs. By prepending 0x00
 * to leaves (and implicitly using no prefix for internal nodes), leaves and
 * internal nodes are cryptographically distinguishable.
 *
 * This is standard in OpenZeppelin's MerkleProof library and StandardMerkleTree.
 * Our Solidity contracts use the same format, ensuring off-chain computed
 * leaves match on-chain verification.
 *
 * @see https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/MerkleProof.sol
 */

import { keccak256, encodeAbiParameters, concat, type Hex, type Address } from 'viem';
import { chainIdToBytes32 } from '@swr/caip';

/**
 * Internal helper for address-based leaf computation.
 * Used by both wallet and contract registries which share the same format.
 */
function computeAddressLeaf(address: Address, chainId: Hex): Hex {
  const innerHash = keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [address, chainId])
  );
  return keccak256(concat(['0x00', innerHash]));
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
 * Uses OpenZeppelin StandardMerkleTree format matching MerkleRootComputation.sol:
 *   leaf = keccak256(bytes.concat(0x00, keccak256(abi.encode(txHash, chainId))))
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
  return keccak256(concat(['0x00', innerHash]));
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
 * Used internally by tree building functions.
 *
 * @param value1 - First value (txHash or address as bytes32)
 * @param value2 - Second value (chainId as bytes32)
 * @returns Merkle leaf hash
 */
export function computeLeaf(value1: Hex, value2: Hex): Hex {
  const innerHash = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [value1, value2])
  );
  return keccak256(concat(['0x00', innerHash]));
}

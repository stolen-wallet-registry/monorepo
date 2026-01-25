import { describe, it, expect } from 'vitest';
import {
  buildContractMerkleTree,
  buildWalletMerkleTree,
  buildTransactionMerkleTree,
  getContractProof,
  getWalletProof,
  getTransactionProof,
  serializeTree,
  deserializeTree,
} from '../src/lib/merkle.js';
import { chainIdToBytes32 } from '../src/lib/caip.js';
import type { Address, Hex } from 'viem';

describe('Merkle Tree', () => {
  const baseChainId = chainIdToBytes32(8453n);
  const ethChainId = chainIdToBytes32(1n);

  describe('buildContractMerkleTree', () => {
    it('builds tree from single entry', () => {
      const entries = [
        { address: '0x1234567890123456789012345678901234567890' as Address, chainId: baseChainId },
      ];

      const { root, leafCount } = buildContractMerkleTree(entries);

      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(leafCount).toBe(1);
    });

    it('builds tree from multiple entries', () => {
      const entries = [
        { address: '0x1234567890123456789012345678901234567890' as Address, chainId: baseChainId },
        { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address, chainId: baseChainId },
        { address: '0x0987654321098765432109876543210987654321' as Address, chainId: ethChainId },
      ];

      const { root, tree, leafCount } = buildContractMerkleTree(entries);

      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(leafCount).toBe(3);

      // Verify we can get proofs
      const proof = getContractProof(
        tree,
        '0x1234567890123456789012345678901234567890' as Address,
        baseChainId
      );
      expect(proof.length).toBeGreaterThan(0);
    });

    it('throws on empty entries', () => {
      expect(() => buildContractMerkleTree([])).toThrow('Cannot build tree with zero entries');
    });
  });

  describe('buildWalletMerkleTree', () => {
    it('builds tree from wallet entries', () => {
      const entries = [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address, chainId: baseChainId },
        { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' as Address, chainId: baseChainId },
      ];

      const { root, tree, leafCount } = buildWalletMerkleTree(entries);

      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(leafCount).toBe(2);

      const proof = getWalletProof(
        tree,
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address,
        baseChainId
      );
      expect(proof.length).toBeGreaterThan(0);
    });
  });

  describe('buildTransactionMerkleTree', () => {
    it('builds tree from transaction entries', () => {
      const entries = [
        {
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
          chainId: baseChainId,
        },
        {
          txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
          chainId: baseChainId,
        },
      ];

      const { root, tree, leafCount } = buildTransactionMerkleTree(entries);

      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(leafCount).toBe(2);

      const proof = getTransactionProof(
        tree,
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        baseChainId
      );
      expect(proof.length).toBeGreaterThan(0);
    });
  });

  describe('tree serialization', () => {
    it('serializes and deserializes tree correctly', () => {
      const entries = [
        { address: '0x1234567890123456789012345678901234567890' as Address, chainId: baseChainId },
        { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address, chainId: baseChainId },
      ];

      const { root, tree } = buildContractMerkleTree(entries);

      const serialized = serializeTree(tree);
      expect(typeof serialized).toBe('string');

      const restored = deserializeTree(serialized);
      expect(restored.root).toBe(root);
    });
  });

  describe('proof retrieval', () => {
    it('throws when entry not found', () => {
      const entries = [
        { address: '0x1234567890123456789012345678901234567890' as Address, chainId: baseChainId },
      ];

      const { tree } = buildContractMerkleTree(entries);

      expect(() =>
        getContractProof(tree, '0x0000000000000000000000000000000000000000' as Address, baseChainId)
      ).toThrow('not found');
    });

    it('is case-insensitive for address matching', () => {
      // Use lowercase in entry (viem accepts lowercase)
      const entries = [
        { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address, chainId: baseChainId },
      ];

      const { tree } = buildContractMerkleTree(entries);

      // Should find entry when looking up with uppercase
      const proof = getContractProof(
        tree,
        '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD' as Address,
        baseChainId
      );
      // For a single-entry tree, proof may be empty but retrieval should succeed
      expect(Array.isArray(proof)).toBe(true);
    });
  });
});

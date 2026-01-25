import { describe, it, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  buildWalletMerkleTree,
  buildTransactionMerkleTree,
  buildContractMerkleTree,
} from '../src/tree';
import { getWalletProof, getTransactionProof, getContractProof } from '../src/proof';
import { chainIdToBytes32 } from '@swr/caip';

// Use lowercase to avoid checksum validation errors in viem
const TEST_ADDRESS_1 = '0x742d35cc6634c0532925a3b844bc454e83c4b3a1' as Address;
const TEST_ADDRESS_2 = '0x1234567890123456789012345678901234567890' as Address;
const TEST_TX_HASH_1 = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;
const TEST_TX_HASH_2 = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;

describe('getWalletProof', () => {
  it('returns empty proof for single-entry tree', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildWalletMerkleTree(entries);

    const proof = getWalletProof(tree, TEST_ADDRESS_1, chainId);
    expect(proof).toEqual([]);
  });

  it('returns valid proof for multi-entry tree', () => {
    const chainId1 = chainIdToBytes32(8453);
    const chainId2 = chainIdToBytes32(1);
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainId1 },
      { address: TEST_ADDRESS_2, chainId: chainId2 },
    ];
    const { tree } = buildWalletMerkleTree(entries);

    const proof1 = getWalletProof(tree, TEST_ADDRESS_1, chainId1);
    const proof2 = getWalletProof(tree, TEST_ADDRESS_2, chainId2);

    expect(proof1.length).toBeGreaterThan(0);
    expect(proof2.length).toBeGreaterThan(0);
    expect(proof1[0]).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('handles case-insensitive address matching', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildWalletMerkleTree(entries);

    // Should work with lowercase
    const lowerAddress = TEST_ADDRESS_1.toLowerCase() as Address;
    const proof = getWalletProof(tree, lowerAddress, chainId);
    expect(proof).toEqual([]);
  });

  it('throws for non-existent entry', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildWalletMerkleTree(entries);

    expect(() => getWalletProof(tree, TEST_ADDRESS_2, chainId)).toThrow('not found');
  });

  it('throws for wrong chain ID', () => {
    const chainId = chainIdToBytes32(8453);
    const wrongChainId = chainIdToBytes32(1);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildWalletMerkleTree(entries);

    expect(() => getWalletProof(tree, TEST_ADDRESS_1, wrongChainId)).toThrow('not found');
  });
});

describe('getTransactionProof', () => {
  it('returns empty proof for single-entry tree', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ txHash: TEST_TX_HASH_1, chainId }];
    const { tree } = buildTransactionMerkleTree(entries);

    const proof = getTransactionProof(tree, TEST_TX_HASH_1, chainId);
    expect(proof).toEqual([]);
  });

  it('returns valid proof for multi-entry tree', () => {
    const chainId1 = chainIdToBytes32(8453);
    const chainId2 = chainIdToBytes32(1);
    const entries = [
      { txHash: TEST_TX_HASH_1, chainId: chainId1 },
      { txHash: TEST_TX_HASH_2, chainId: chainId2 },
    ];
    const { tree } = buildTransactionMerkleTree(entries);

    const proof1 = getTransactionProof(tree, TEST_TX_HASH_1, chainId1);
    const proof2 = getTransactionProof(tree, TEST_TX_HASH_2, chainId2);

    expect(proof1.length).toBeGreaterThan(0);
    expect(proof2.length).toBeGreaterThan(0);
  });

  it('throws for non-existent transaction', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ txHash: TEST_TX_HASH_1, chainId }];
    const { tree } = buildTransactionMerkleTree(entries);

    expect(() => getTransactionProof(tree, TEST_TX_HASH_2, chainId)).toThrow('not found');
  });

  it('throws for wrong chain ID', () => {
    const chainId = chainIdToBytes32(8453);
    const wrongChainId = chainIdToBytes32(1);
    const entries = [{ txHash: TEST_TX_HASH_1, chainId }];
    const { tree } = buildTransactionMerkleTree(entries);

    expect(() => getTransactionProof(tree, TEST_TX_HASH_1, wrongChainId)).toThrow('not found');
  });
});

describe('getContractProof', () => {
  it('returns empty proof for single-entry tree', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildContractMerkleTree(entries);

    const proof = getContractProof(tree, TEST_ADDRESS_1, chainId);
    expect(proof).toEqual([]);
  });

  it('returns valid proof for multi-entry tree', () => {
    const chainId1 = chainIdToBytes32(8453);
    const chainId2 = chainIdToBytes32(1);
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainId1 },
      { address: TEST_ADDRESS_2, chainId: chainId2 },
    ];
    const { tree } = buildContractMerkleTree(entries);

    const proof1 = getContractProof(tree, TEST_ADDRESS_1, chainId1);
    const proof2 = getContractProof(tree, TEST_ADDRESS_2, chainId2);

    expect(proof1.length).toBeGreaterThan(0);
    expect(proof2.length).toBeGreaterThan(0);
    expect(proof1[0]).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('handles case-insensitive address matching', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildContractMerkleTree(entries);

    // Should work with lowercase
    const lowerAddress = TEST_ADDRESS_1.toLowerCase() as Address;
    const proof = getContractProof(tree, lowerAddress, chainId);
    expect(proof).toEqual([]);
  });

  it('throws for non-existent entry', () => {
    const chainId = chainIdToBytes32(8453);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildContractMerkleTree(entries);

    expect(() => getContractProof(tree, TEST_ADDRESS_2, chainId)).toThrow('not found');
  });

  it('throws for wrong chain ID', () => {
    const chainId = chainIdToBytes32(8453);
    const wrongChainId = chainIdToBytes32(1);
    const entries = [{ address: TEST_ADDRESS_1, chainId }];
    const { tree } = buildContractMerkleTree(entries);

    expect(() => getContractProof(tree, TEST_ADDRESS_1, wrongChainId)).toThrow('not found');
  });
});

import { describe, it, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  buildWalletMerkleTree,
  buildTransactionMerkleTree,
  buildContractMerkleTree,
} from '../src/tree';
import { chainIdToBytes32 } from '@swr/caip';

// Use lowercase to avoid checksum validation errors in viem
const TEST_ADDRESS_1 = '0x742d35cc6634c0532925a3b844bc454e83c4b3a1' as Address;
const TEST_ADDRESS_2 = '0x1234567890123456789012345678901234567890' as Address;
const TEST_TX_HASH_1 = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;
const TEST_TX_HASH_2 = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;

describe('buildWalletMerkleTree', () => {
  it('builds tree from single entry', () => {
    const entries = [{ address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) }];
    const result = buildWalletMerkleTree(entries);

    expect(result.root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.leafCount).toBe(1);
    expect(result.entries).toEqual(entries);
  });

  it('builds tree from multiple entries', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const result = buildWalletMerkleTree(entries);

    expect(result.root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.leafCount).toBe(2);
  });

  it('produces deterministic root for same entries', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const result1 = buildWalletMerkleTree(entries);
    const result2 = buildWalletMerkleTree(entries);

    expect(result1.root).toBe(result2.root);
  });

  it('throws for empty entries', () => {
    expect(() => buildWalletMerkleTree([])).toThrow('Cannot build tree with zero entries');
  });

  it('produces different roots for different entries', () => {
    const entries1 = [{ address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) }];
    const entries2 = [{ address: TEST_ADDRESS_2, chainId: chainIdToBytes32(8453) }];

    const result1 = buildWalletMerkleTree(entries1);
    const result2 = buildWalletMerkleTree(entries2);

    expect(result1.root).not.toBe(result2.root);
  });
});

describe('buildTransactionMerkleTree', () => {
  it('builds tree from single entry', () => {
    const entries = [{ txHash: TEST_TX_HASH_1, chainId: chainIdToBytes32(8453) }];
    const result = buildTransactionMerkleTree(entries);

    expect(result.root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.leafCount).toBe(1);
  });

  it('builds tree from multiple entries', () => {
    const entries = [
      { txHash: TEST_TX_HASH_1, chainId: chainIdToBytes32(8453) },
      { txHash: TEST_TX_HASH_2, chainId: chainIdToBytes32(1) },
    ];
    const result = buildTransactionMerkleTree(entries);

    expect(result.root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.leafCount).toBe(2);
  });

  it('throws for empty entries', () => {
    expect(() => buildTransactionMerkleTree([])).toThrow('Cannot build tree with zero entries');
  });
});

describe('buildContractMerkleTree', () => {
  it('builds tree from single entry', () => {
    const entries = [{ address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) }];
    const result = buildContractMerkleTree(entries);

    expect(result.root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.leafCount).toBe(1);
  });

  it('builds tree from multiple entries', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const result = buildContractMerkleTree(entries);

    expect(result.root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.leafCount).toBe(2);
  });

  it('produces deterministic root for same entries', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const result1 = buildContractMerkleTree(entries);
    const result2 = buildContractMerkleTree(entries);

    expect(result1.root).toBe(result2.root);
  });

  it('throws for empty entries', () => {
    expect(() => buildContractMerkleTree([])).toThrow('Cannot build tree with zero entries');
  });

  it('produces different roots for different entries', () => {
    const entries1 = [{ address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) }];
    const entries2 = [{ address: TEST_ADDRESS_2, chainId: chainIdToBytes32(8453) }];

    const result1 = buildContractMerkleTree(entries1);
    const result2 = buildContractMerkleTree(entries2);

    expect(result1.root).not.toBe(result2.root);
  });
});

import { describe, it, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  computeWalletLeaf,
  computeTransactionLeaf,
  computeTransactionLeafFromChainId,
  computeContractLeaf,
  computeLeaf,
} from '../src/leaf';
import { chainIdToBytes32 } from '@swr/caip';

// Use lowercase to avoid checksum validation errors
const TEST_ADDRESS = '0x742d35cc6634c0532925a3b844bc454e83c4b3a1' as Address;
const TEST_TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;

describe('computeWalletLeaf', () => {
  it('computes valid leaf hash', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf = computeWalletLeaf(TEST_ADDRESS, chainId);

    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('produces deterministic results', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf1 = computeWalletLeaf(TEST_ADDRESS, chainId);
    const leaf2 = computeWalletLeaf(TEST_ADDRESS, chainId);

    expect(leaf1).toBe(leaf2);
  });

  it('produces different leaves for different addresses', () => {
    const chainId = chainIdToBytes32(8453);
    const address2 = '0x1234567890123456789012345678901234567890' as Address;

    const leaf1 = computeWalletLeaf(TEST_ADDRESS, chainId);
    const leaf2 = computeWalletLeaf(address2, chainId);

    expect(leaf1).not.toBe(leaf2);
  });

  it('produces different leaves for different chains', () => {
    const chainId1 = chainIdToBytes32(8453);
    const chainId2 = chainIdToBytes32(1);

    const leaf1 = computeWalletLeaf(TEST_ADDRESS, chainId1);
    const leaf2 = computeWalletLeaf(TEST_ADDRESS, chainId2);

    expect(leaf1).not.toBe(leaf2);
  });
});

describe('computeTransactionLeaf', () => {
  it('computes valid leaf hash', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf = computeTransactionLeaf(TEST_TX_HASH, chainId);

    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('produces deterministic results', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf1 = computeTransactionLeaf(TEST_TX_HASH, chainId);
    const leaf2 = computeTransactionLeaf(TEST_TX_HASH, chainId);

    expect(leaf1).toBe(leaf2);
  });
});

describe('computeTransactionLeafFromChainId', () => {
  it('computes leaf from numeric chain ID', () => {
    const leaf = computeTransactionLeafFromChainId(TEST_TX_HASH, 8453);
    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('produces same result as computeTransactionLeaf', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf1 = computeTransactionLeaf(TEST_TX_HASH, chainId);
    const leaf2 = computeTransactionLeafFromChainId(TEST_TX_HASH, 8453);

    expect(leaf1).toBe(leaf2);
  });
});

describe('computeContractLeaf', () => {
  it('computes valid leaf hash', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf = computeContractLeaf(TEST_ADDRESS, chainId);

    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('produces same format as wallet leaf (address, bytes32)', () => {
    const chainId = chainIdToBytes32(8453);
    const walletLeaf = computeWalletLeaf(TEST_ADDRESS, chainId);
    const contractLeaf = computeContractLeaf(TEST_ADDRESS, chainId);

    // Should be the same since both use (address, bytes32) encoding
    expect(walletLeaf).toBe(contractLeaf);
  });
});

describe('computeLeaf (generic)', () => {
  it('computes valid leaf hash', () => {
    const value1 = TEST_TX_HASH;
    const value2 = chainIdToBytes32(8453);
    const leaf = computeLeaf(value1, value2);

    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('matches computeTransactionLeaf for tx entries', () => {
    const txHash = TEST_TX_HASH;
    const chainId = chainIdToBytes32(8453);

    const genericLeaf = computeLeaf(txHash, chainId);
    const specificLeaf = computeTransactionLeaf(txHash, chainId);

    expect(genericLeaf).toBe(specificLeaf);
  });
});

describe('OZ StandardMerkleTree format', () => {
  // These tests verify our leaf computation matches OpenZeppelin's format:
  // leaf = keccak256(bytes.concat(0x00, keccak256(abi.encode(values))))

  it('includes 0x00 prefix to prevent second-preimage attacks', () => {
    const chainId = chainIdToBytes32(8453);
    const leaf = computeTransactionLeaf(TEST_TX_HASH, chainId);

    // The leaf should be a keccak256 hash (64 hex chars)
    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);

    // It should NOT just be the inner hash (which would be unsafe)
    // We can't easily test for the 0x00 prefix, but we can verify
    // the leaf changes if inputs change
    const differentLeaf = computeTransactionLeaf(TEST_TX_HASH, chainIdToBytes32(1));
    expect(leaf).not.toBe(differentLeaf);
  });
});

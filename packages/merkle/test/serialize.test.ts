import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { buildWalletMerkleTree } from '../src/tree';
import { serializeTree, deserializeTree } from '../src/serialize';
import { getWalletProof } from '../src/proof';
import { chainIdToBytes32 } from '@swr/caip';

const TEST_ADDRESS_1 = '0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1' as Address;
const TEST_ADDRESS_2 = '0x1234567890123456789012345678901234567890' as Address;

describe('serializeTree', () => {
  it('serializes tree to JSON string', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const { tree } = buildWalletMerkleTree(entries);

    const json = serializeTree(tree);

    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('produces valid OZ format', () => {
    const entries = [{ address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) }];
    const { tree } = buildWalletMerkleTree(entries);

    const json = serializeTree(tree);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('format', 'standard-v1');
    expect(parsed).toHaveProperty('tree');
    expect(parsed).toHaveProperty('values');
    expect(parsed).toHaveProperty('leafEncoding');
  });
});

describe('deserializeTree', () => {
  it('deserializes JSON to tree', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const { tree, root } = buildWalletMerkleTree(entries);

    const json = serializeTree(tree);
    const restored = deserializeTree(json);

    expect(restored.root).toBe(root);
  });

  it('preserves proof generation capability', () => {
    const chainId1 = chainIdToBytes32(8453);
    const chainId2 = chainIdToBytes32(1);
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainId1 },
      { address: TEST_ADDRESS_2, chainId: chainId2 },
    ];
    const { tree } = buildWalletMerkleTree(entries);

    const json = serializeTree(tree);
    const restored = deserializeTree(json);

    // Original proof
    const originalProof = getWalletProof(tree, TEST_ADDRESS_1, chainId1);

    // Restored proof
    const restoredProof = getWalletProof(restored, TEST_ADDRESS_1, chainId1);

    expect(restoredProof).toEqual(originalProof);
  });
});

describe('round-trip serialization', () => {
  it('preserves all tree data through serialize/deserialize', () => {
    const entries = [
      { address: TEST_ADDRESS_1, chainId: chainIdToBytes32(8453) },
      { address: TEST_ADDRESS_2, chainId: chainIdToBytes32(1) },
    ];
    const { tree, root } = buildWalletMerkleTree(entries);

    // Multiple round trips
    let json = serializeTree(tree);
    let restored = deserializeTree(json);

    json = serializeTree(restored);
    restored = deserializeTree(json);

    expect(restored.root).toBe(root);
  });
});

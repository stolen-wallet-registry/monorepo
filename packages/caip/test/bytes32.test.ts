import { describe, it, expect } from 'vitest';
import { computeCAIP2Hash, chainIdToBytes32, caip2ToBytes32 } from '../src/bytes32';

describe('computeCAIP2Hash', () => {
  it('computes keccak256 hash of CAIP-2 string', () => {
    // These values are pre-computed and verified against Solidity CAIP2.fromEIP155()
    expect(computeCAIP2Hash('eip155:1')).toBe(
      '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6'
    );
    expect(computeCAIP2Hash('eip155:8453')).toBe(
      '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec'
    );
    expect(computeCAIP2Hash('eip155:10')).toBe(
      '0x83153bb1dd0a48bb74b01b90ac672ee6185cc64877b9c948eec5e4e5f11585f0'
    );
  });

  it('produces different hashes for different chains', () => {
    const hash1 = computeCAIP2Hash('eip155:1');
    const hash8453 = computeCAIP2Hash('eip155:8453');
    expect(hash1).not.toBe(hash8453);
  });
});

describe('chainIdToBytes32', () => {
  it('converts numeric chain ID to bytes32 hash', () => {
    expect(chainIdToBytes32(1)).toBe(
      '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6'
    );
    expect(chainIdToBytes32(8453)).toBe(
      '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec'
    );
  });

  it('handles bigint input', () => {
    expect(chainIdToBytes32(BigInt(8453))).toBe(
      '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec'
    );
  });

  it('produces consistent results for number and bigint', () => {
    expect(chainIdToBytes32(8453)).toBe(chainIdToBytes32(BigInt(8453)));
  });

  it('throws for invalid chain IDs', () => {
    expect(() => chainIdToBytes32(-1)).toThrow('invalid or exceeds safe integer range');
    expect(() => chainIdToBytes32(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      'invalid or exceeds safe integer range'
    );
  });
});

describe('caip2ToBytes32', () => {
  it('converts CAIP-2 string to bytes32 hash', () => {
    expect(caip2ToBytes32('eip155:1')).toBe(
      '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6'
    );
    expect(caip2ToBytes32('eip155:8453')).toBe(
      '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec'
    );
  });

  it('throws for non-EVM CAIP-2', () => {
    expect(() => caip2ToBytes32('solana:mainnet')).toThrow('Unsupported or invalid CAIP-2 format');
  });

  it('throws for invalid CAIP-2', () => {
    expect(() => caip2ToBytes32('invalid')).toThrow('Unsupported or invalid CAIP-2 format');
    expect(() => caip2ToBytes32('eip155:abc')).toThrow('Unsupported or invalid CAIP-2 format');
  });

  it('produces same result as chainIdToBytes32', () => {
    expect(caip2ToBytes32('eip155:8453')).toBe(chainIdToBytes32(8453));
    expect(caip2ToBytes32('eip155:1')).toBe(chainIdToBytes32(1));
  });
});

describe('contract compatibility', () => {
  // These tests verify that our TypeScript outputs match Solidity CAIP2.fromEIP155()
  // If these fail, merkle proofs will be invalid on-chain

  it('Base mainnet (8453) matches Solidity', () => {
    const expected = '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec';
    expect(chainIdToBytes32(8453)).toBe(expected);
  });

  it('Ethereum mainnet (1) matches Solidity', () => {
    const expected = '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6';
    expect(chainIdToBytes32(1)).toBe(expected);
  });

  it('Optimism (10) matches Solidity', () => {
    const expected = '0x83153bb1dd0a48bb74b01b90ac672ee6185cc64877b9c948eec5e4e5f11585f0';
    expect(chainIdToBytes32(10)).toBe(expected);
  });

  it('Arbitrum (42161) matches Solidity', () => {
    const expected = '0x1fca116f439fa7af0604ced8c7a6239cdcabb5070838cbc80cdba0089733e472';
    expect(chainIdToBytes32(42161)).toBe(expected);
  });

  it('Anvil local (31337) matches Solidity', () => {
    const expected = '0x318e51c37247d03bad135571413b06a083591bcc680967d80bf587ac928cf369';
    expect(chainIdToBytes32(31337)).toBe(expected);
  });
});

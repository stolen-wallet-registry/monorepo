import { describe, it, expect } from 'vitest';
import {
  chainIdToBytes32,
  caip2ToBytes32,
  bytes32ToCAIP2,
  getChainName,
  CHAIN_IDS,
} from '../src/lib/caip.js';

describe('CAIP Helpers', () => {
  // Pre-computed keccak256 hashes from Solidity CAIP2.fromEIP155()
  // These match the CAIP2_LOOKUP table in @swr/chains
  const BASE_HASH = '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec';
  const ETHEREUM_HASH = '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6';
  const ARBITRUM_HASH = '0x1fca116f439fa7af0604ced8c7a6239cdcabb5070838cbc80cdba0089733e472';
  const OPTIMISM_HASH = '0x83153bb1dd0a48bb74b01b90ac672ee6185cc64877b9c948eec5e4e5f11585f0';

  describe('chainIdToBytes32', () => {
    it('converts numeric chain ID to keccak256 hash (matches Solidity)', () => {
      const result = chainIdToBytes32(8453n);
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result).toBe(BASE_HASH);
    });

    it('handles Ethereum mainnet', () => {
      const result = chainIdToBytes32(1n);
      expect(result).toBe(ETHEREUM_HASH);
    });

    it('accepts number input', () => {
      const result = chainIdToBytes32(8453);
      expect(result).toBe(BASE_HASH);
    });

    it('handles Optimism', () => {
      const result = chainIdToBytes32(10);
      expect(result).toBe(OPTIMISM_HASH);
    });
  });

  describe('caip2ToBytes32', () => {
    it('parses CAIP-2 string to keccak256 hash', () => {
      const result = caip2ToBytes32('eip155:8453');
      expect(result).toBe(BASE_HASH);
    });

    it('parses Ethereum mainnet', () => {
      const result = caip2ToBytes32('eip155:1');
      expect(result).toBe(ETHEREUM_HASH);
    });

    it('parses Arbitrum One', () => {
      const result = caip2ToBytes32('eip155:42161');
      expect(result).toBe(ARBITRUM_HASH);
    });

    it('throws on invalid format', () => {
      expect(() => caip2ToBytes32('invalid')).toThrow('Unsupported or invalid CAIP-2 format');
      expect(() => caip2ToBytes32('eip155')).toThrow('Unsupported or invalid CAIP-2 format');
    });

    it('throws on unsupported namespace', () => {
      // Non-EVM namespaces return null from caip2ToNumericChainId, which triggers our error
      expect(() => caip2ToBytes32('solana:mainnet')).toThrow(
        'Unsupported or invalid CAIP-2 format'
      );
    });
  });

  describe('bytes32ToCAIP2', () => {
    it('resolves known hash back to CAIP-2', () => {
      const result = bytes32ToCAIP2(BASE_HASH);
      expect(result).toBe('eip155:8453');
    });

    it('resolves Ethereum hash', () => {
      const result = bytes32ToCAIP2(ETHEREUM_HASH);
      expect(result).toBe('eip155:1');
    });

    it('returns null for unknown hash', () => {
      const unknownHash = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const result = bytes32ToCAIP2(unknownHash);
      expect(result).toBeNull();
    });

    it('round-trips correctly for known chains', () => {
      const original = 'eip155:42161';
      const bytes32 = caip2ToBytes32(original);
      const restored = bytes32ToCAIP2(bytes32);
      expect(restored).toBe(original);
    });
  });

  describe('getChainName', () => {
    it('returns name for known chains', () => {
      expect(getChainName(1n)).toBe('Ethereum');
      expect(getChainName(8453n)).toBe('Base');
      expect(getChainName(10n)).toBe('Optimism');
    });

    it('returns CAIP-2 string for unknown chains', () => {
      // @swr/chains returns the CAIP-2 string itself if no human name is found
      expect(getChainName(99999n)).toBe('eip155:99999');
    });
  });

  describe('CHAIN_IDS constants', () => {
    it('has correct values', () => {
      expect(CHAIN_IDS.ETHEREUM).toBe(1n);
      expect(CHAIN_IDS.BASE).toBe(8453n);
      expect(CHAIN_IDS.OPTIMISM).toBe(10n);
      expect(CHAIN_IDS.ANVIL).toBe(31337n);
    });
  });
});

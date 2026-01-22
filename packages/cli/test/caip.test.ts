import { describe, it, expect } from 'vitest';
import {
  chainIdToBytes32,
  caip2ToBytes32,
  bytes32ToCaip2,
  getChainName,
  CHAIN_IDS,
} from '../src/lib/caip.js';

describe('CAIP Helpers', () => {
  describe('chainIdToBytes32', () => {
    it('converts numeric chain ID to bytes32', () => {
      const result = chainIdToBytes32(8453n);
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000002105');
    });

    it('handles small chain IDs', () => {
      const result = chainIdToBytes32(1n);
      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000000001');
    });

    it('accepts number input', () => {
      const result = chainIdToBytes32(8453);
      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000002105');
    });
  });

  describe('caip2ToBytes32', () => {
    it('parses CAIP-2 string', () => {
      const result = caip2ToBytes32('eip155:8453');
      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000002105');
    });

    it('parses Ethereum mainnet', () => {
      const result = caip2ToBytes32('eip155:1');
      expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000000001');
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

  describe('bytes32ToCaip2', () => {
    it('converts bytes32 back to CAIP-2', () => {
      const bytes32 = '0x0000000000000000000000000000000000000000000000000000000000002105';
      const result = bytes32ToCaip2(bytes32);
      expect(result).toBe('eip155:8453');
    });

    it('round-trips correctly', () => {
      const original = 'eip155:42161';
      const bytes32 = caip2ToBytes32(original);
      const restored = bytes32ToCaip2(bytes32);
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

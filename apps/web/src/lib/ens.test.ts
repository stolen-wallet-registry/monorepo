import { describe, it, expect } from 'vitest';
import { isEnsName, detectSearchTypeWithEns, isDisplaySafeEnsName } from './ens';

describe('isEnsName', () => {
  it('returns true for valid ENS names', () => {
    expect(isEnsName('vitalik.eth')).toBe(true);
    expect(isEnsName('dao.vitalik.eth')).toBe(true);
    expect(isEnsName('my-name.eth')).toBe(true);
    expect(isEnsName('test123.eth')).toBe(true);
    expect(isEnsName('abc.eth')).toBe(true); // Minimum length
  });

  it('handles whitespace and casing', () => {
    expect(isEnsName('  vitalik.eth  ')).toBe(true);
    expect(isEnsName('VITALIK.ETH')).toBe(true);
    expect(isEnsName('Vitalik.Eth')).toBe(true);
  });

  it('returns false for hex addresses', () => {
    expect(isEnsName('0x1234567890123456789012345678901234567890')).toBe(false);
    expect(isEnsName('0xd8dA6BF26963aF9D7dB9bBa65e6b7C0e0e7bF1dC')).toBe(false);
  });

  it('returns false for non-.eth domains', () => {
    expect(isEnsName('vitalik.com')).toBe(false);
    expect(isEnsName('vitalik.xyz')).toBe(false);
    expect(isEnsName('vitalik.org')).toBe(false);
  });

  it('returns false for names too short', () => {
    expect(isEnsName('ab.eth')).toBe(false); // Only 2 chars before .eth
    expect(isEnsName('a.eth')).toBe(false);
    expect(isEnsName('.eth')).toBe(false);
  });

  it('returns false for empty or invalid inputs', () => {
    expect(isEnsName('')).toBe(false);
    expect(isEnsName('   ')).toBe(false);
    // @ts-expect-error - testing invalid input
    expect(isEnsName(null)).toBe(false);
    // @ts-expect-error - testing invalid input
    expect(isEnsName(undefined)).toBe(false);
  });
});

describe('detectSearchTypeWithEns', () => {
  describe('ENS names', () => {
    it('detects valid ENS names', () => {
      expect(detectSearchTypeWithEns('vitalik.eth')).toBe('ens');
      expect(detectSearchTypeWithEns('my-name.eth')).toBe('ens');
      expect(detectSearchTypeWithEns('subdomain.name.eth')).toBe('ens');
    });

    it('handles whitespace', () => {
      expect(detectSearchTypeWithEns('  vitalik.eth  ')).toBe('ens');
    });
  });

  describe('Ethereum addresses', () => {
    it('detects valid addresses (42 chars)', () => {
      expect(detectSearchTypeWithEns('0x1234567890123456789012345678901234567890')).toBe('address');
      expect(detectSearchTypeWithEns('0xd8dA6BF26963aF9D7dB9bBa65e6b7C0e0e7bF1dC')).toBe('address');
    });

    it('handles mixed case addresses', () => {
      expect(detectSearchTypeWithEns('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe('address');
    });
  });

  describe('transaction hashes', () => {
    it('detects valid transaction hashes (66 chars)', () => {
      const txHash = '0x' + 'a'.repeat(64);
      expect(detectSearchTypeWithEns(txHash)).toBe('transaction');
    });

    it('handles mixed case hashes', () => {
      const txHash = '0x' + 'AbCdEf'.repeat(10) + 'AbCd';
      expect(detectSearchTypeWithEns(txHash)).toBe('transaction');
    });
  });

  describe('CAIP-10 identifiers', () => {
    it('detects valid CAIP-10 format', () => {
      expect(detectSearchTypeWithEns('eip155:1:0x1234567890123456789012345678901234567890')).toBe(
        'caip10'
      );
      expect(
        detectSearchTypeWithEns('eip155:8453:0xabcdef1234567890abcdef1234567890abcdef12')
      ).toBe('caip10');
    });
  });

  describe('invalid inputs', () => {
    it('returns invalid for empty or whitespace', () => {
      expect(detectSearchTypeWithEns('')).toBe('invalid');
      expect(detectSearchTypeWithEns('   ')).toBe('invalid');
    });

    it('returns invalid for malformed inputs', () => {
      expect(detectSearchTypeWithEns('not-an-address')).toBe('invalid');
      expect(detectSearchTypeWithEns('0x123')).toBe('invalid'); // Too short
      expect(detectSearchTypeWithEns('vitalik')).toBe('invalid'); // No .eth
    });

    it('handles null/undefined gracefully', () => {
      // @ts-expect-error - testing invalid input
      expect(detectSearchTypeWithEns(null)).toBe('invalid');
      // @ts-expect-error - testing invalid input
      expect(detectSearchTypeWithEns(undefined)).toBe('invalid');
    });
  });
});

describe('isDisplaySafeEnsName', () => {
  // A resolved ENS name is attacker-controlled: anyone can register a name, point it at their
  // own wallet, and set the reverse record. Wherever the UI substitutes that name for a hex
  // address in a slot used to decide whom to trust, the attacker chooses what that slot says.

  it('accepts an ordinary name', () => {
    expect(isDisplaySafeEnsName('vitalik.eth')).toBe(true);
    expect(isDisplaySafeEnsName('dao.vitalik.eth')).toBe(true);
  });

  it('rejects a name shaped like a hex address', () => {
    // The vector that makes the normalization gate insufficient on its own: pure ASCII,
    // fully ENSIP-15-valid, registerable today, and normalize() returns it unchanged. In an
    // address slot it reads as a hex address while resolving to the attacker's wallet.
    expect(isDisplaySafeEnsName('0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth')).toBe(false);
  });

  it('rejects a name impersonating a truncated address', () => {
    // Addresses are usually shown truncated, so a short hex prefix is enough to impersonate.
    expect(isDisplaySafeEnsName('0xd8da6b.eth')).toBe(false);
  });

  it('rejects a name that is not its own normalized form', () => {
    // Uppercase does not survive ENSIP-15 normalization, so displaying it would show
    // something other than the name that actually resolves.
    expect(isDisplaySafeEnsName('Vitalik.eth')).toBe(false);
  });

  it('rejects names carrying bidirectional control characters', () => {
    // RLO reorders the text around it, letting a name rewrite the sentence it sits in.
    expect(isDisplaySafeEnsName('‮kcatta.eth')).toBe(false);
    expect(isDisplaySafeEnsName('safe⁦name.eth')).toBe(false);
  });

  it('rejects names that cannot be normalized at all', () => {
    expect(isDisplaySafeEnsName(' .eth')).toBe(false);
  });

  it('rejects empty and absent names', () => {
    expect(isDisplaySafeEnsName(null)).toBe(false);
    expect(isDisplaySafeEnsName(undefined)).toBe(false);
    expect(isDisplaySafeEnsName('')).toBe(false);
  });
});

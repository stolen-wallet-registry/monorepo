import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import {
  EVM_WILDCARD_CAIP2,
  identifierToAddress,
  isEvmIdentifier,
  normalizeIdentifier,
  truncateToAddress,
  walletCaip10,
} from '../src/lib/identifiers';

const EVM_ADDR = '0x742d35cc6634c0532925a3b844bc454e83c4b3a1';
const EVM_ID = `0x000000000000000000000000${EVM_ADDR.slice(2)}` as Hex;

/** A 32-byte non-EVM identifier (e.g. a Solana pubkey) whose LAST 20 bytes equal EVM_ADDR. */
const NON_EVM_COLLIDING = `0xdeadbeefcafebabe00000001${EVM_ADDR.slice(2)}` as Hex;

describe('normalizeIdentifier', () => {
  it('lowercases and zero-pads to 32 bytes', () => {
    expect(normalizeIdentifier('0xABCD' as Hex)).toBe(`0x${'0'.repeat(60)}abcd`);
  });

  it('is idempotent on an already-normalized value', () => {
    expect(normalizeIdentifier(EVM_ID)).toBe(EVM_ID);
  });

  it('throws on values longer than 32 bytes rather than silently truncating', () => {
    expect(() => normalizeIdentifier(`0x${'ab'.repeat(33)}` as Hex)).toThrow(
      /longer than 32 bytes/
    );
  });
});

describe('isEvmIdentifier', () => {
  it('accepts a zero-padded address', () => {
    expect(isEvmIdentifier(EVM_ID)).toBe(true);
  });

  it('rejects an identifier with non-zero high bytes', () => {
    expect(isEvmIdentifier(NON_EVM_COLLIDING)).toBe(false);
  });

  it('rejects the zero identifier', () => {
    expect(isEvmIdentifier(`0x${'0'.repeat(64)}` as Hex)).toBe(false);
  });
});

describe('identifierToAddress', () => {
  // Also covers operator IDs: `OperatorSubmitter._getOperatorId()` returns
  // `bytes32(uint256(uint160(msg.sender)))`, which is the same encoding as EVM_ID.
  it('decodes an EVM identifier', () => {
    expect(identifierToAddress(EVM_ID)).toBe(EVM_ADDR);
  });

  it('is case-insensitive', () => {
    expect(identifierToAddress(EVM_ID.toUpperCase().replace('0X', '0x') as Hex)).toBe(EVM_ADDR);
  });

  it('returns null for a non-EVM identifier instead of truncating it', () => {
    // The regression this guards: blind truncation returned EVM_ADDR here, so this
    // non-EVM account collided with the real EVM wallet and .onConflictDoNothing()
    // silently dropped one of the two registrations.
    expect(identifierToAddress(NON_EVM_COLLIDING)).toBeNull();
  });

  it('returns null for the zero identifier', () => {
    expect(identifierToAddress(`0x${'0'.repeat(64)}` as Hex)).toBeNull();
  });
});

describe('walletCaip10', () => {
  it('uses the wildcard chain reference for EVM wallets', () => {
    // The contract's wallet storage key is chain-wildcarded for eip155, so pinning any
    // single chain (previously the hub's) made exact-match CAIP-10 search miss.
    expect(walletCaip10(EVM_ID, 'eip155:1')).toBe(`${EVM_WILDCARD_CAIP2}:${EVM_ADDR}`);
    expect(walletCaip10(EVM_ID, null)).toBe(`${EVM_WILDCARD_CAIP2}:${EVM_ADDR}`);
  });

  it('keeps the full identifier and the reported chain for non-EVM wallets', () => {
    expect(walletCaip10(NON_EVM_COLLIDING, 'solana:mainnet')).toBe(
      `solana:mainnet:${normalizeIdentifier(NON_EVM_COLLIDING)}`
    );
  });

  it('falls back to an unknown namespace when the reported chain does not resolve', () => {
    expect(walletCaip10(NON_EVM_COLLIDING, null)).toBe(
      `unknown:*:${normalizeIdentifier(NON_EVM_COLLIDING)}`
    );
  });
});

describe('truncateToAddress', () => {
  it('mirrors ContractRegistry unconditional truncation', () => {
    // ContractRegistry.registerContractsFromOperator does
    // `address(uint160(uint256(identifier)))` with no namespace branch, so the indexer
    // must truncate the same way or its rows would not match on-chain identity.
    expect(truncateToAddress(NON_EVM_COLLIDING)).toBe(EVM_ADDR);
    expect(truncateToAddress(EVM_ID)).toBe(EVM_ADDR);
  });
});

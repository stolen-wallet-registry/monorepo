import { describe, it, expect } from 'vitest';
import {
  encodePairingToken,
  decodePairingToken,
  isSameAddress,
  PAIRING_TOKEN_VERSION,
} from './pairingToken';
import type { Address } from '@/lib/types/ethereum';

// A real Ed25519 peer ID string: the codec parses it with libp2p rather than pattern-matching.
const PEER_ID = '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN';
const ADDRESS = '0x742d35cc6634c0532925a3b844bc9e7595f0beb1' as Address;

describe('encodePairingToken', () => {
  it('produces a single versioned token containing both fields', () => {
    expect(encodePairingToken(PEER_ID, ADDRESS)).toBe(
      `${PAIRING_TOKEN_VERSION}:${PEER_ID}:${ADDRESS}`
    );
  });

  it('round-trips through the decoder', () => {
    const result = decodePairingToken(encodePairingToken(PEER_ID, ADDRESS));
    expect(result).toEqual({ ok: true, token: { peerId: PEER_ID, address: ADDRESS } });
  });
});

describe('decodePairingToken', () => {
  it('tolerates surrounding whitespace from a clipboard paste', () => {
    const result = decodePairingToken(`  ${encodePairingToken(PEER_ID, ADDRESS)}\n`);
    expect(result.ok).toBe(true);
  });

  // The whole point of the version prefix. A bare peer ID is what the flow used to accept,
  // and it carries no wallet address — silently accepting it would restore the unauthorized
  // -wallet path the token exists to close.
  it('rejects a bare legacy peer ID with its own explained error', () => {
    const result = decodePairingToken(PEER_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('legacy-peer-id');
    expect(result.message).toMatch(/pairing code/i);
    expect(result.message).toContain('swr1:');
  });

  it('rejects an empty paste', () => {
    expect(decodePairingToken('   ')).toMatchObject({ ok: false, error: 'empty' });
  });

  it('rejects an unknown version tag', () => {
    expect(decodePairingToken(`swr9:${PEER_ID}:${ADDRESS}`)).toMatchObject({
      ok: false,
      error: 'malformed',
    });
  });

  it('rejects a token missing a field', () => {
    expect(decodePairingToken(`${PAIRING_TOKEN_VERSION}:${PEER_ID}`)).toMatchObject({
      ok: false,
      error: 'malformed',
    });
  });

  it('rejects a token whose peer ID does not parse', () => {
    expect(decodePairingToken(`${PAIRING_TOKEN_VERSION}:not-a-peer-id:${ADDRESS}`)).toMatchObject({
      ok: false,
      error: 'invalid-peer-id',
    });
  });

  it('rejects a token whose address is not an address', () => {
    expect(decodePairingToken(`${PAIRING_TOKEN_VERSION}:${PEER_ID}:0xnope`)).toMatchObject({
      ok: false,
      error: 'invalid-address',
    });
  });

  it('rejects free text that is neither a token nor a peer ID', () => {
    expect(decodePairingToken('hello there')).toMatchObject({ ok: false, error: 'malformed' });
  });
});

describe('isSameAddress', () => {
  it('compares case-insensitively so a checksummed token matches a recovered signer', () => {
    expect(isSameAddress(ADDRESS, ADDRESS.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('is false when either side is missing rather than treating null as a match', () => {
    expect(isSameAddress(null, ADDRESS)).toBe(false);
    expect(isSameAddress(ADDRESS, undefined)).toBe(false);
    expect(isSameAddress(null, null)).toBe(false);
  });

  it('is false for different addresses', () => {
    expect(isSameAddress(ADDRESS, `0x${'b'.repeat(40)}`)).toBe(false);
  });
});

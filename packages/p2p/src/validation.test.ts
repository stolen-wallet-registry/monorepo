import { describe, it, expect } from 'vitest';
import {
  safeJsonParse,
  validateStreamData,
  isWithinSizeLimit,
  extractPeerIdFromMultiaddr,
  MAX_STREAM_SIZE_BYTES,
} from './validation';

describe('safeJsonParse', () => {
  it('strips __proto__ key from parsed JSON', () => {
    const malicious = '{"__proto__":{"polluted":true},"safe":"value"}';
    const result = safeJsonParse(malicious) as Record<string, unknown>;

    // Key should not exist as own property
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    expect(result.safe).toBe('value');
  });

  it('strips constructor key from parsed JSON', () => {
    const malicious = '{"constructor":{"prototype":{"bad":true}},"safe":"value"}';
    const result = safeJsonParse(malicious) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
    expect(result.safe).toBe('value');
  });

  it('strips prototype key from parsed JSON', () => {
    const malicious = '{"prototype":{"bad":true},"safe":"value"}';
    const result = safeJsonParse(malicious) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(false);
    expect(result.safe).toBe('value');
  });

  it('strips dangerous keys in nested objects', () => {
    const malicious = '{"outer":{"__proto__":{"bad":true},"good":"value"}}';
    const result = safeJsonParse(malicious) as { outer: Record<string, unknown> };

    expect(Object.prototype.hasOwnProperty.call(result.outer, '__proto__')).toBe(false);
    expect(result.outer.good).toBe('value');
  });

  it('throws on invalid JSON', () => {
    expect(() => safeJsonParse('not json')).toThrow();
  });
});

describe('validateStreamData', () => {
  it('parses JSON string and validates', () => {
    const json = '{"success":true,"message":"test"}';
    const result = validateStreamData(json);
    expect(result).toEqual({ success: true, message: 'test' });
  });

  it('returns null for invalid JSON string', () => {
    expect(validateStreamData('not valid json')).toBeNull();
  });

  it('returns null for unknown keys (strict mode security)', () => {
    expect(validateStreamData({ success: true, unknownField: 'value' })).toBeNull();
  });

  it('returns null for invalid ethereum address', () => {
    expect(validateStreamData({ form: { registeree: 'not-an-address' } })).toBeNull();
  });

  it('parses valid form data with ethereum address', () => {
    const validForm = { form: { registeree: '0x1234567890123456789012345678901234567890' } };
    const result = validateStreamData(validForm);
    expect(result).toEqual(validForm);
  });
});

describe('isWithinSizeLimit', () => {
  it('returns false for data over limit', () => {
    const overLimit = 'a'.repeat(MAX_STREAM_SIZE_BYTES + 1);
    expect(isWithinSizeLimit(overLimit)).toBe(false);
  });

  it('handles multi-byte UTF-8 correctly', () => {
    // Each emoji is 4 bytes - this catches byte vs char length bugs
    const emoji = '🔥';
    const maxEmojis = Math.floor(MAX_STREAM_SIZE_BYTES / 4);
    expect(isWithinSizeLimit(emoji.repeat(maxEmojis))).toBe(true);
    expect(isWithinSizeLimit(emoji.repeat(maxEmojis + 1))).toBe(false);
  });
});

describe('extractPeerIdFromMultiaddr', () => {
  it('extracts peer ID from standard multiaddr', () => {
    expect(extractPeerIdFromMultiaddr('/ip4/127.0.0.1/tcp/4001/p2p/QmPeerId123')).toBe(
      'QmPeerId123'
    );
  });

  it('extracts final peer ID from circuit relay multiaddr', () => {
    const circuitRelay = '/dns4/relay.example.com/tcp/443/wss/p2p/QmRelay/p2p-circuit/p2p/QmTarget';
    expect(extractPeerIdFromMultiaddr(circuitRelay)).toBe('QmTarget');
  });

  it('extracts relay peer ID when multiaddr ends with /p2p-circuit', () => {
    const relayServer = '/dns4/relay.example.com/tcp/443/wss/p2p/QmRelayId/p2p-circuit';
    expect(extractPeerIdFromMultiaddr(relayServer)).toBe('QmRelayId');
  });

  it('returns null when no /p2p/ component', () => {
    expect(extractPeerIdFromMultiaddr('/ip4/127.0.0.1/tcp/4001')).toBeNull();
  });
});

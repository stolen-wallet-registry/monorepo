import { describe, it, expect } from 'vitest';
import { PROTOCOL_SCHEMAS, SignatureOverTheWireSchema } from './types';
import { PROTOCOLS } from './protocols';

/**
 * The wire schema is what a consumer reads to learn the shape of a relayed signature, so the
 * shape it advertises has to be the shape it enforces.
 *
 * It previously did not. `value`, `deadline`, `nonce`, `windowBlock` and `windowBlockHash`
 * were bare length caps: `"hello"` passed as a signature and `"abc"` passed as a block number,
 * and `windowBlock` could arrive without the hash it is meaningless without. apps/web checked
 * all of it one layer up in `signatureData.ts`, so nothing broke — but the enforcement lived
 * above the schema that advertised the shape, and any second consumer inherited none of it.
 *
 * These assert the rejections. A payload that reaches a relayer's submit path and only fails
 * on chain has already cost that relayer the gas.
 */

const BASE = {
  keyRef: 'ack',
  chainId: 8453,
  address: '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0',
  value: `0x${'a'.repeat(130)}`,
  deadline: '1700000000',
  nonce: '3',
};

const parse = (overrides: Record<string, unknown>) =>
  SignatureOverTheWireSchema.safeParse({ ...BASE, ...overrides });

describe('SignatureOverTheWireSchema — signature value', () => {
  it('accepts a 65-byte signature', () => {
    expect(parse({}).success).toBe(true);
  });

  it.each([
    ['a short string', 'hello'],
    ['a 64-byte signature', `0x${'a'.repeat(128)}`],
    ['a 66-byte signature', `0x${'a'.repeat(132)}`],
    ['hex without the 0x prefix', 'a'.repeat(130)],
    ['non-hex characters', `0x${'z'.repeat(130)}`],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(parse({ value }).success).toBe(false);
  });
});

describe('SignatureOverTheWireSchema — decimal fields', () => {
  it.each(['deadline', 'nonce', 'windowBlock', 'incidentTimestamp', 'reportedChainId'])(
    '%s rejects a value BigInt() would throw on',
    (field) => {
      // The concrete failure: `BigInt("abc")` throws inside the relayer's submit path.
      expect(parse({ ...windowPair(), [field]: 'abc' }).success).toBe(false);
    }
  );

  it.each(['deadline', 'nonce'])('%s rejects hex, signs, decimals and padding', (field) => {
    for (const bad of ['0x10', '-1', '1.5', '007', '1e3', ' 1', '']) {
      expect(parse({ [field]: bad }).success, `${field}=${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('accepts zero and a full-width uint256', () => {
    expect(parse({ nonce: '0' }).success).toBe(true);
    expect(parse({ nonce: '1'.repeat(78) }).success).toBe(true);
  });

  it('rejects a value wider than uint256', () => {
    expect(parse({ nonce: '1'.repeat(79) }).success).toBe(false);
  });

  // `reportedChainId` is decimal here and bytes32 on the transaction batch. Enforcing bytes32
  // on this one would reject every relayed wallet signature, so the distinction is pinned.
  it('takes reportedChainId as a decimal chain ID, not a bytes32 hash', () => {
    expect(parse({ reportedChainId: '8453' }).success).toBe(true);
    expect(parse({ reportedChainId: `0x${'1'.repeat(64)}` }).success).toBe(false);
  });
});

/** A well-formed registration freshness commitment. */
function windowPair() {
  return { windowBlock: '12345', windowBlockHash: `0x${'b'.repeat(64)}` };
}

describe('SignatureOverTheWireSchema — window freshness commitment', () => {
  it('accepts a well-formed pair', () => {
    expect(parse(windowPair()).success).toBe(true);
  });

  it('accepts an acknowledgement, which carries neither half', () => {
    expect(parse({}).success).toBe(true);
  });

  it('rejects a windowBlockHash that is not bytes32', () => {
    expect(parse({ windowBlock: '1', windowBlockHash: 'hello' }).success).toBe(false);
    expect(parse({ windowBlock: '1', windowBlockHash: `0x${'b'.repeat(62)}` }).success).toBe(false);
  });

  // Half a pair is a transaction that can only revert: the relayer submits `windowBlock` as
  // calldata and the contract rebuilds the signed digest from `windowBlockHash`.
  it('rejects a windowBlock with no hash', () => {
    expect(parse({ windowBlock: '12345' }).success).toBe(false);
  });

  it('rejects a hash with no windowBlock', () => {
    expect(parse({ windowBlockHash: `0x${'b'.repeat(64)}` }).success).toBe(false);
  });

  it('names the offending field so a rejection is diagnosable', () => {
    const result = parse({ windowBlock: '12345' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/both be present or both be absent/);
    }
  });
});

describe('SignatureOverTheWireSchema — envelope', () => {
  it('rejects an address that is not an address', () => {
    expect(parse({ address: '0xnope' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(parse({ surprise: 'x' }).success).toBe(false);
  });

  it('rejects a non-positive chainId', () => {
    expect(parse({ chainId: 0 }).success).toBe(false);
  });
});

// ─── Both halves of the re-sign exchange are declared here ──────────────────────────────────
//
// RESIGN_ACK was originally declared inside apps/web because the change that introduced it had
// no write access to this package, with the web app keeping a local schema map as a fallback.
// Having one half of an exchange upstream and the other in a consumer is how the two drift.
describe('re-sign exchange protocols', () => {
  it('declares the request and its acknowledgement together', () => {
    expect(PROTOCOLS.RESIGN_REQ).toBe('/swr/resign-request/1.0.0');
    // Pinned to the literal, not to the constant: this string is on the wire, and a peer
    // running the previous web-local declaration must still match. Renaming it is a protocol
    // change, and it should fail here rather than silently stop pairing.
    expect(PROTOCOLS.RESIGN_ACK).toBe('/swr/resign-ack/1.0.0');
  });

  it('registers a schema for both, so neither fails the fail-closed guard', () => {
    // `validateProtocolMessage` rejects any protocol with no schema. An id in PROTOCOLS with
    // no entry here is a protocol that can be sent and never received.
    expect(PROTOCOL_SCHEMAS[PROTOCOLS.RESIGN_REQ]).toBeDefined();
    expect(PROTOCOL_SCHEMAS[PROTOCOLS.RESIGN_ACK]).toBeDefined();
  });

  it('accepts the acknowledgement payload the receiver actually sends', () => {
    const schema = PROTOCOL_SCHEMAS[PROTOCOLS.RESIGN_ACK]!;
    expect(schema.safeParse({ success: true, message: 'going back to sign' }).success).toBe(true);
    expect(schema.safeParse({ success: false, message: 'resign budget spent' }).success).toBe(true);
  });

  it('rejects an acknowledgement carrying anything the relayer might act on', () => {
    const schema = PROTOCOL_SCHEMAS[PROTOCOLS.RESIGN_ACK]!;
    // The confirmation shape is strict on purpose: `success` is the entire decision, so a
    // signature or a step smuggled alongside it must not survive the gate.
    expect(schema.safeParse({ success: true, reason: 'window-closed' }).success).toBe(false);
    expect(schema.safeParse({ success: true, signature: { value: '0x' } }).success).toBe(false);
  });

  it('keeps every declared protocol schema-backed', () => {
    // Generalises the RESIGN_ACK case: the gap this closes is a protocol declared without a
    // schema, which fails closed at runtime and is invisible until a peer tries to use it.
    const unbacked = Object.entries(PROTOCOLS)
      .filter(([, id]) => PROTOCOL_SCHEMAS[id] === undefined)
      .map(([name]) => name);
    expect(unbacked).toEqual([]);
  });
});

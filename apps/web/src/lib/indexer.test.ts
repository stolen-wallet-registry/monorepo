import { describe, it, expect } from 'vitest';

import {
  parseIndexerAddress,
  parseIndexerHash,
  requireIndexerAddress,
  requireIndexerHash,
  IndexerDataError,
} from './indexer';

/**
 * These parsers replaced `raw.operator as Address` / `raw.transactionHash as Hash` at the
 * indexer boundary (audit follow-up to V30).
 *
 * The GraphQL response types are hand-written interfaces describing what the indexer is
 * *expected* to send. A cast asserted that expectation into the type system and disabled the
 * only mechanism that could report it wrong — so a null, a truncated string, or an ENS name
 * flowed on typed as `Address` and failed somewhere unrelated, typically as a broken explorer
 * link on a fraud record. Each case below is a value that the old cast accepted silently.
 */
describe('indexer boundary parsing', () => {
  const VALID_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
  const VALID_HASH = `0x${'ab'.repeat(32)}`;

  describe('parseIndexerAddress', () => {
    it('accepts a well-formed address', () => {
      expect(parseIndexerAddress(VALID_ADDRESS)).toBe(VALID_ADDRESS);
    });

    // THE load-bearing case. viem's `isAddress` defaults to strict EIP-55 checksum validation,
    // which every all-lowercase address fails — and the indexer returns addresses lowercased.
    // A strict parser here would drop every row in every dashboard table while looking correct
    // in review. This test is what caught that during implementation; do not "tighten" the
    // parser to strict without a plan for it.
    it('accepts a lowercase address (indexers do not checksum)', () => {
      const lower = VALID_ADDRESS.toLowerCase();
      expect(parseIndexerAddress(lower)).toBe(lower);
    });

    // The corollary: since checksum casing is not validated, a mixed-case address with a WRONG
    // checksum is still accepted. That is intentional — casing is a typo aid for human input,
    // and the property we need off the wire is shape.
    it('accepts a mixed-case address regardless of checksum correctness', () => {
      const miscased = `0x${'a'.repeat(20)}${'B'.repeat(20)}`;
      expect(parseIndexerAddress(miscased)).toBe(miscased);
    });

    // Each of these was silently accepted by `as Address`.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 12345],
      ['an object', { id: VALID_ADDRESS }],
      ['an empty string', ''],
      ['an ENS name', 'vitalik.eth'],
      ['a truncated address', '0x742d35Cc6634C0532925a3b844Bc9e7595f0'],
      ['a bytes32 identifier, not an address', `0x${'00'.repeat(32)}`],
      ['non-hex characters', '0xZZZZ35Cc6634C0532925a3b844Bc9e7595f0bEb1'],
    ])('rejects %s', (_label, value) => {
      expect(parseIndexerAddress(value)).toBeUndefined();
    });
  });

  describe('parseIndexerHash', () => {
    it('accepts a well-formed hash', () => {
      expect(parseIndexerHash(VALID_HASH)).toBe(VALID_HASH);
    });

    // An address is 20 bytes and a hash is 32; the cast let one stand in for the other, which
    // is how a batch row ends up linking to an explorer page that does not exist.
    it.each([
      ['null', null],
      ['an address (20 bytes, not 32)', VALID_ADDRESS],
      ['a short hash', '0xabcdef'],
      ['a number', 42],
    ])('rejects %s', (_label, value) => {
      expect(parseIndexerHash(value)).toBeUndefined();
    });
  });

  // Detail views throw rather than substitute: someone inspecting one fraud record is very
  // likely deciding whether to trust an address, and a silently-absent submitter answers that
  // question wrongly. List views drop-and-log instead; see the note in indexer.ts.
  describe('require* variants fail closed', () => {
    it('returns the value when it parses', () => {
      expect(requireIndexerAddress(VALID_ADDRESS, 'operator', 'batch-1')).toBe(VALID_ADDRESS);
      expect(requireIndexerHash(VALID_HASH, 'transactionHash', 'batch-1')).toBe(VALID_HASH);
    });

    it('throws IndexerDataError naming the field and record', () => {
      expect(() => requireIndexerAddress(null, 'operator', 'batch-7')).toThrow(IndexerDataError);
      expect(() => requireIndexerAddress(null, 'operator', 'batch-7')).toThrow(/operator/);
      expect(() => requireIndexerAddress(null, 'operator', 'batch-7')).toThrow(/batch-7/);
    });

    it('throws rather than returning a falsy value a caller might render', () => {
      expect(() => requireIndexerHash('0xdeadbeef', 'transactionHash', 'batch-9')).toThrow(
        IndexerDataError
      );
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  concat,
  encodeAbiParameters,
  numberToHex,
  pad,
  toEventSelector,
  type Hex,
  type Log,
} from 'viem';

import { extractBridgeMessageId, DISPATCH_EVENT, DISPATCH_ID_EVENT } from './messageId';

/**
 * These tests exist because a wrong topic or a reordered field would make every lookup return
 * null (or, worse, a plausible-but-wrong hash) with nothing to notice it. The message ID drives
 * the bridge explorer link a user follows to confirm their cross-chain registration.
 *
 * The expected IDs below are GOLDEN VALUES captured from @hyperlane-xyz/sdk@20.1.0
 * (`HyperlaneCore.getDispatchedMessages`) on these exact fixtures, recorded in a differential
 * run before the dependency was removed. They are not self-computed, so they still pin the
 * behaviour now that the SDK is gone: recomputing them with the implementation under test
 * would make the assertion circular and worthless.
 */

const DISPATCH_TOPIC0 = toEventSelector(DISPATCH_EVENT);
const DISPATCH_ID_TOPIC0 = toEventSelector(DISPATCH_ID_EVENT);

const MAILBOX = '0x9999999999999999999999999999999999999999';

interface MessageParts {
  nonce: number;
  origin: number;
  sender: Hex;
  destination: number;
  recipient: Hex;
  body: Hex;
}

/** Hyperlane wire format: version(1) nonce(4) origin(4) sender(32) destination(4) recipient(32) body(n) */
function buildMessage(parts: MessageParts): Hex {
  return concat([
    numberToHex(3, { size: 1 }),
    numberToHex(parts.nonce, { size: 4 }),
    numberToHex(parts.origin, { size: 4 }),
    pad(parts.sender, { size: 32 }),
    numberToHex(parts.destination, { size: 4 }),
    pad(parts.recipient, { size: 32 }),
    parts.body,
  ]);
}

function dispatchLog(parts: MessageParts, logIndex = 0): Log {
  return {
    address: MAILBOX,
    topics: [
      DISPATCH_TOPIC0,
      pad(parts.sender, { size: 32 }),
      numberToHex(parts.destination, { size: 32 }),
      pad(parts.recipient, { size: 32 }),
    ],
    data: encodeAbiParameters([{ type: 'bytes' }], [buildMessage(parts)]),
    blockNumber: 123n,
    blockHash: pad('0x01', { size: 32 }),
    transactionHash: pad('0x02', { size: 32 }),
    transactionIndex: 0,
    logIndex,
    removed: false,
  } as Log;
}

function dispatchIdLog(messageId: Hex, logIndex = 1): Log {
  return {
    address: MAILBOX,
    topics: [DISPATCH_ID_TOPIC0, messageId],
    data: '0x',
    blockNumber: 123n,
    blockHash: pad('0x01', { size: 32 }),
    transactionHash: pad('0x02', { size: 32 }),
    transactionIndex: 0,
    logIndex,
    removed: false,
  } as Log;
}

function unrelatedLog(logIndex = 0): Log {
  return {
    address: '0xdead00000000000000000000000000000000dead',
    topics: [pad('0xabcdef', { size: 32 })],
    data: '0x',
    blockNumber: 123n,
    blockHash: pad('0x01', { size: 32 }),
    transactionHash: pad('0x02', { size: 32 }),
    transactionIndex: 0,
    logIndex,
    removed: false,
  } as Log;
}

const BASIC: MessageParts = {
  nonce: 1,
  origin: 84532,
  sender: '0x1111111111111111111111111111111111111111',
  destination: 11155420,
  recipient: '0x2222222222222222222222222222222222222222',
  body: '0xdeadbeef',
};

const EMPTY_BODY: MessageParts = {
  nonce: 0,
  origin: 8453,
  sender: '0x3333333333333333333333333333333333333333',
  destination: 10,
  recipient: '0x4444444444444444444444444444444444444444',
  body: '0x',
};

const LONG_BODY: MessageParts = {
  nonce: 99999,
  origin: 1,
  sender: '0x5555555555555555555555555555555555555555',
  destination: 42161,
  recipient: '0x6666666666666666666666666666666666666666',
  body: `0x${'ab'.repeat(257)}`,
};

const SHORT_BODY: MessageParts = {
  nonce: 7,
  origin: 137,
  sender: '0x7777777777777777777777777777777777777777',
  destination: 8453,
  recipient: '0x8888888888888888888888888888888888888888',
  body: '0x00ff10',
};

// Captured from @hyperlane-xyz/sdk@20.1.0 before removal. Do not recompute.
const SDK_IDS = {
  basic: '0x2766b351206b92e1538b6d1a2bb5fdf04fd9076715b23ee7058f69e61e88ac39',
  emptyBody: '0xe1db6f3ab39fa1dfca8e608c0c435ca913b47a82a5a6b4243c9edc7e541986ba',
  longBody: '0x1fda5446d6301284d7cd952e2175ca36078826b4f07547928a4dabae5b996fd2',
  shortBody: '0x2b0bf112a91e41268c7e316eac99f471378748dadb0d79bc2bf998b6715220ff',
} as const;

describe('V30 — Hyperlane message ID without the SDK', () => {
  describe('event signature', () => {
    // If this constant is wrong, every extraction silently returns null. Pinning the literal
    // means a well-meaning edit to the ABI string fails here instead of in production.
    it('matches the known Dispatch topic0', () => {
      expect(DISPATCH_TOPIC0).toBe(
        '0x769f711d20c679153d382254f59892613b58a97cc876b249134ac25c80f9c814'
      );
    });
  });

  describe('parity with @hyperlane-xyz/sdk', () => {
    it.each([
      ['basic message', BASIC, SDK_IDS.basic],
      ['empty body', EMPTY_BODY, SDK_IDS.emptyBody],
      ['body spanning multiple words', LONG_BODY, SDK_IDS.longBody],
      ['body shorter than one word', SHORT_BODY, SDK_IDS.shortBody],
    ])('reproduces the SDK message ID for %s', async (_name, parts, expected) => {
      await expect(extractBridgeMessageId([dispatchLog(parts)])).resolves.toBe(expected);
    });

    // The Mailbox emits DispatchId with the same value; agreeing with it is independent
    // evidence the Dispatch decode is right, not just self-consistent.
    it('agrees with the Mailbox DispatchId event', async () => {
      const logs = [dispatchLog(BASIC), dispatchIdLog(SDK_IDS.basic)];
      await expect(extractBridgeMessageId(logs)).resolves.toBe(SDK_IDS.basic);
    });
  });

  describe('log selection', () => {
    it('ignores unrelated logs around the Dispatch', async () => {
      const logs = [unrelatedLog(0), dispatchLog(BASIC, 1), unrelatedLog(2)];
      await expect(extractBridgeMessageId(logs)).resolves.toBe(SDK_IDS.basic);
    });

    it('matches on the event topic regardless of emitting address', async () => {
      const log = { ...dispatchLog(BASIC), address: '0x1234567890123456789012345678901234567890' };
      await expect(extractBridgeMessageId([log as Log])).resolves.toBe(SDK_IDS.basic);
    });

    it('returns the first Dispatch when several are present', async () => {
      const logs = [dispatchLog(BASIC, 0), dispatchLog(LONG_BODY, 1)];
      await expect(extractBridgeMessageId(logs)).resolves.toBe(SDK_IDS.basic);
    });

    it('returns null when there is no Dispatch event', async () => {
      await expect(extractBridgeMessageId([unrelatedLog()])).resolves.toBeNull();
    });

    it('returns null for empty logs', async () => {
      await expect(extractBridgeMessageId([])).resolves.toBeNull();
    });
  });

  describe('resilience', () => {
    // A missing message ID costs an explorer link; the registration is already confirmed on
    // chain by the time this runs, so nothing here may throw into the caller.
    it('returns null rather than throwing on a malformed Dispatch payload', async () => {
      const broken = { ...dispatchLog(BASIC), data: '0xdeadbeef' } as Log;
      await expect(extractBridgeMessageId([broken])).resolves.toBeNull();
    });

    it('still returns the Dispatch-derived ID when DispatchId disagrees', async () => {
      const logs = [dispatchLog(BASIC), dispatchIdLog(pad('0xbad', { size: 32 }))];
      await expect(extractBridgeMessageId(logs)).resolves.toBe(SDK_IDS.basic);
    });

    it('tolerates a truncated DispatchId log', async () => {
      const bad = { ...dispatchIdLog(SDK_IDS.basic), topics: [DISPATCH_ID_TOPIC0] } as Log;
      await expect(extractBridgeMessageId([dispatchLog(BASIC), bad])).resolves.toBe(SDK_IDS.basic);
    });
  });

  describe('provider routing', () => {
    it('returns null for an unknown bridge provider', async () => {
      await expect(
        extractBridgeMessageId([dispatchLog(BASIC)], 'unknown' as 'hyperlane')
      ).resolves.toBeNull();
    });

    it('defaults to hyperlane', async () => {
      await expect(extractBridgeMessageId([dispatchLog(BASIC)])).resolves.toBe(SDK_IDS.basic);
    });
  });
});

/**
 * UI-1. `sendResignRequest` returning true only means the stream write resolved — and this
 * codebase already established, for CONNECT, that a write a peer silently DROPS also resolves.
 * The relayer navigated back to "waiting for a signature" on that basis, so a registeree who
 * refused (limit reached, or a poll moved its step so `resignTargetStep` returned null) left
 * both sides waiting forever, with no timeout and no control on either screen.
 *
 * These cases pin the three outcomes and the arming race that makes them reliable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PROTOCOLS, PROTOCOL_SCHEMAS } from '@swr/p2p';

vi.mock('@/lib/logger', () => ({
  logger: {
    p2p: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

const passStreamData = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('./libp2p', () => ({
  passStreamData: (...args: unknown[]) => passStreamData(...args),
}));

const {
  armResignAck,
  waitForResignAck,
  publishResignAck,
  resetResignAckForTesting,
  sendResignAck,
  RESIGN_ACK,
} = await import('./resignAck');

beforeEach(() => {
  resetResignAckForTesting();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resign acknowledgement — relayer side', () => {
  it('resolves accepted when the partner honours the request', async () => {
    armResignAck();
    const pending = waitForResignAck(1_000);
    publishResignAck(true);
    await expect(pending).resolves.toBe('accepted');
  });

  it('resolves refused when the partner declines', async () => {
    armResignAck();
    const pending = waitForResignAck(1_000);
    publishResignAck(false);
    await expect(pending).resolves.toBe('refused');
  });

  /**
   * The deadlock the whole mechanism exists to prevent: the partner never answers. Reported as
   * 'timeout' rather than 'refused' because the request may genuinely have landed — the
   * relayer is told to check, not that it was rejected.
   */
  it('resolves timeout when nothing comes back', async () => {
    vi.useFakeTimers();
    armResignAck();
    const pending = waitForResignAck(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toBe('timeout');
  });

  /**
   * The race that makes arming a separate call: the partner is on the other side of a relay
   * and can answer before `passStreamData` has even resolved locally. An answer with nobody
   * listening yet must be buffered, not dropped — dropping it means waiting the full timeout
   * for a reply that already arrived.
   */
  it('buffers an answer that arrives before anyone waits', async () => {
    armResignAck();
    publishResignAck(true);
    await expect(waitForResignAck(1_000)).resolves.toBe('accepted');
  });

  /**
   * A late reply to a PREVIOUS request must not be consumed as the reply to this one — that
   * would be a stale 'accepted' navigating the relayer away from a request nobody answered.
   */
  it('discards a leftover answer when a new request is armed', async () => {
    vi.useFakeTimers();
    armResignAck();
    publishResignAck(true); // answer to request #1, never consumed

    armResignAck(); // request #2
    const pending = waitForResignAck(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toBe('timeout');
  });

  /** An unsolicited reply is a duplicate or a peer probing; it must not settle anything. */
  it('ignores an answer nobody asked for', async () => {
    vi.useFakeTimers();
    publishResignAck(true);

    armResignAck();
    const pending = waitForResignAck(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toBe('timeout');
  });

  /** Waiting without arming can never be settled, so it reports immediately rather than hanging. */
  it('reports a timeout at once when nothing was armed', async () => {
    await expect(waitForResignAck(30_000)).resolves.toBe('timeout');
  });
});

describe('resign acknowledgement — receiver side', () => {
  it('writes the decision on the RESIGN_ACK protocol', async () => {
    await sendResignAck({ connection: {} as never, accepted: false, message: 'nope' });

    expect(passStreamData).toHaveBeenCalledWith(
      expect.objectContaining({
        protocols: [RESIGN_ACK],
        streamData: { success: false, message: 'nope' },
      })
    );
  });

  /**
   * Never throws. This runs inside a stream handler mid-recovery; an exception escaping would
   * abort the handler, and the relayer's timeout path already covers an undelivered answer.
   */
  it('swallows a failed write', async () => {
    passStreamData.mockRejectedValueOnce(new Error('stream reset'));
    await expect(
      sendResignAck({ connection: {} as never, accepted: true, message: 'ok' })
    ).resolves.toBeUndefined();
  });
});

describe('RESIGN_ACK protocol registration', () => {
  // The protocol id and its schema both live in `@swr/p2p` now; this app must be using that
  // declaration rather than a second copy, or the two can drift into a silent mismatch.
  it('is the upstream protocol id, not a local copy of the string', () => {
    expect(RESIGN_ACK).toBe(PROTOCOLS.RESIGN_ACK);
    expect(RESIGN_ACK).toBe('/swr/resign-ack/1.0.0');
  });

  // Without a schema entry, `validateProtocolMessage` fails closed and every answer is dropped
  // — which is the deadlock again, silently.
  it('has a schema so peerGuard admits it', () => {
    expect(PROTOCOL_SCHEMAS[RESIGN_ACK]).toBeDefined();
  });

  it('accepts a confirmation payload and rejects anything richer', () => {
    const schema = PROTOCOL_SCHEMAS[RESIGN_ACK];
    expect(schema).toBeDefined();
    expect(schema?.safeParse({ success: true, message: 'ok' }).success).toBe(true);
    // `.strict()` — an answer may not smuggle a signature or a step alongside its verdict.
    expect(schema?.safeParse({ success: true, signature: {} }).success).toBe(false);
  });
});

/**
 * Acknowledgement of a re-sign request (registeree/reporter → relayer).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────
 * `sendResignRequest` returns true the moment `passStreamData` resolves, and the relayer then
 * navigated straight back to "waiting for a signature". But this codebase already established
 * the opposite rule for CONNECT — see `WaitForConnectionStep`, which documents that *writing
 * to a stream a peer silently drops still resolves* and therefore waits for a reply.
 *
 * The same is true here, and the failure is worse, because the receiver has explicit refusal
 * paths: `MAX_RESIGN_REQUESTS` has been reached, or `resignTargetStep` returned null because a
 * poll moved the receiver's step. In either case the receiver drops the request and stays put
 * while the relayer sits on a screen waiting for a signature nobody is going to send — no
 * timeout, no retry control, on either side.
 *
 * So the receiver now answers every request, including its refusals, and the relayer only
 * moves once that answer arrives.
 *
 * ── Why the protocol lives here and not in `@swr/p2p` ────────────────────────────────────
 * The protocol STRING is declared here because this change did not have write access to
 * `packages/p2p`. The payload is the existing `ConfirmationMessage` shape (`{success,
 * message}`), which `ParsedStreamDataSchema` — the strict envelope every inbound message is
 * parsed against first — already accepts, so nothing about the wire format needed a change
 * upstream. Only the protocol id and its schema registration are local.
 *
 * TODO(packages/p2p): move `RESIGN_ACK` into `PROTOCOLS` and `PROTOCOL_SCHEMAS` next to
 * `RESIGN_REQ`, then delete {@link LOCAL_PROTOCOL_SCHEMAS} and import it like every other
 * protocol. Both halves of the exchange should be declared in the same place.
 *
 * `success` carries the whole decision:
 *   - `true`  — the request was honoured and the receiver is moving back to a sign step.
 *   - `false` — the request was refused. `message` is prose for logs; the relayer renders its
 *               own copy, because this string comes from a peer.
 */

import type { Connection } from '@libp2p/interface';
import { ConfirmationMessageSchema } from '@swr/p2p';
import type { z } from 'zod';

import { logger } from '@/lib/logger';
import { passStreamData } from './libp2p';

/** Re-sign acknowledgement (receiver → relayer), the reply to `PROTOCOLS.RESIGN_REQ`. */
export const RESIGN_ACK = '/swr/resign-ack/1.0.0';

/**
 * Protocols this app speaks that `@swr/p2p` does not yet declare a schema for.
 *
 * Consulted by `peerGuard.validateProtocolMessage` after `PROTOCOL_SCHEMAS`. Kept as a
 * separate map rather than mutating the imported one: a shared module quietly gaining entries
 * at import time is the kind of action-at-a-distance that makes a security check hard to
 * reason about, and this way the fallback is visible at the one place that reads it.
 */
export const LOCAL_PROTOCOL_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  [RESIGN_ACK]: ConfirmationMessageSchema,
};

/**
 * How long the relayer waits for the answer before giving up.
 *
 * Same 30s `WaitForConnectionStep` uses for the CONNECT reply, deliberately: it is the same
 * question (did the peer actually act on what I wrote?) over the same transport.
 */
export const RESIGN_ACK_TIMEOUT_MS = 30_000;

/** What came back, or didn't. */
export type ResignAckOutcome =
  /** The partner accepted and is moving back to sign again. */
  | 'accepted'
  /** The partner explicitly refused — the request will never be honoured. */
  | 'refused'
  /** Nothing came back in time. Unknown, not refused: the request may still have landed. */
  | 'timeout';

// ── Relayer side: wait for the answer ──────────────────────────────────────────────────────
//
// Module state rather than a store or a prop. The request is sent from a pay step and the
// answer arrives on a libp2p stream handler owned by the page — two components with no
// relationship to thread a callback through — and exactly one pay step is mounted at a time,
// so a single slot is sufficient and a queue would only be able to mismatch answers to
// requests.

let armed = false;
let waiter: ((outcome: ResignAckOutcome) => void) | null = null;
let buffered: ResignAckOutcome | null = null;

/**
 * Start listening for an answer. Call this BEFORE writing the request.
 *
 * Separate from {@link waitForResignAck} to close a real race: the partner can answer before
 * `passStreamData` has even resolved on this side, and an answer with nobody listening yet
 * would be dropped and then waited for forever. Arming first means such an answer is buffered.
 *
 * Also clears any leftover answer, so a late reply to a PREVIOUS request cannot be consumed as
 * the reply to this one — which would be a stale "accepted" navigating the relayer away.
 */
export function armResignAck(): void {
  armed = true;
  waiter = null;
  buffered = null;
}

/**
 * Record the partner's answer. Called by the page's `RESIGN_ACK` stream handler.
 *
 * A reply nobody asked for is dropped: the relayer only ever waits for one immediately after
 * sending a request, so an unsolicited one is either a duplicate or a peer probing.
 */
export function publishResignAck(accepted: boolean): void {
  if (!armed) {
    logger.p2p.warn('Ignored a re-sign acknowledgement that was not asked for', { accepted });
    return;
  }

  const outcome: ResignAckOutcome = accepted ? 'accepted' : 'refused';
  armed = false;

  if (waiter) {
    const resolve = waiter;
    waiter = null;
    resolve(outcome);
    return;
  }

  buffered = outcome;
}

/**
 * Wait for the answer armed by {@link armResignAck}.
 *
 * Resolves rather than rejects on timeout: "no answer" is a distinct, reportable state, not an
 * exception. Never resolves 'accepted' without an actual reply, which is the whole point.
 */
export function waitForResignAck(
  timeoutMs: number = RESIGN_ACK_TIMEOUT_MS
): Promise<ResignAckOutcome> {
  if (buffered) {
    const outcome = buffered;
    buffered = null;
    return Promise.resolve(outcome);
  }

  if (!armed) {
    // Nothing is expected, so nothing will arrive. Reporting a timeout immediately beats
    // hanging for 30 seconds on a promise that cannot be settled.
    logger.p2p.warn('Waited for a re-sign acknowledgement without arming first');
    return Promise.resolve('timeout');
  }

  return new Promise((resolve) => {
    const timerId = setTimeout(() => {
      if (waiter) {
        waiter = null;
        armed = false;
        logger.p2p.warn('No re-sign acknowledgement from the partner before timeout', {
          timeoutMs,
        });
        resolve('timeout');
      }
    }, timeoutMs);

    waiter = (outcome) => {
      clearTimeout(timerId);
      resolve(outcome);
    };
  });
}

/** Test seam: drop any armed/buffered state between cases. */
export function resetResignAckForTesting(): void {
  armed = false;
  waiter = null;
  buffered = null;
}

// ── Receiver side: answer every request ────────────────────────────────────────────────────

/**
 * Answer a re-sign request.
 *
 * Never throws. A failure to reply leaves the relayer on its timeout path, which is strictly
 * better than an exception escaping a stream handler mid-recovery — and there is nothing
 * useful the receiver could do about it anyway.
 *
 * @param accepted - true only if the request was honoured and this side is moving back to sign
 * @param message - prose for the relayer's LOG. The relayer renders its own copy; this string
 *   crosses a trust boundary and must never be displayed.
 */
export async function sendResignAck({
  connection,
  accepted,
  message,
}: {
  connection: Connection;
  accepted: boolean;
  message: string;
}): Promise<void> {
  try {
    await passStreamData({
      connection,
      protocols: [RESIGN_ACK],
      streamData: { success: accepted, message },
    });
    logger.p2p.info('Answered the re-sign request', { accepted });
  } catch (err) {
    logger.p2p.warn('Could not answer the re-sign request; the relayer will time out', {
      accepted,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

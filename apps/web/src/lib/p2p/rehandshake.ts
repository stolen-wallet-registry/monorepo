/**
 * Re-establishing the CONNECT handshake after a mid-flow reload.
 *
 * ── The dead end this exists to close ────────────────────────────────────────────────────
 * `relayerFromPeerSession` / `forwarderFromPeerSession` are session-only by design: never
 * persisted, forced false on rehydrate. That is correct and must stay — the relayer is the
 * `trustedForwarder` the victim signs over, and a value read back from localStorage may have
 * been written by anyone with access to the browser profile.
 *
 * But the registration stores deliberately PERSIST `step`, so a reload resumes at a sign step
 * with the flag false. The flag is only ever set by an inbound CONNECT, CONNECT was only
 * admitted at `wait-for-connection`, and CONNECT was only ever SENT from
 * `WaitForConnectionStep` — which is not rendered at a sign step on either side. So the sign
 * gate refused forever while its error text promised a reconnection that had no code path.
 * The only escape was "Start Over", and if the acknowledgement had already landed on chain
 * that meant the relayer paying gas for a second one.
 *
 * ── The fix, and why it does not weaken the gate ─────────────────────────────────────────
 * The blocked party re-dials its already-pinned partner and re-runs the handshake in place.
 * The flag still flips only on a live inbound CONNECT — what changes is that such a CONNECT
 * can now legitimately arrive at a sign step, and that the party who needs one can ask for it.
 *
 * Three independent things must hold before the flag flips on this path, and no two of them
 * are the same kind of evidence:
 *
 *   1. **A live, authenticated stream.** libp2p's noise handshake authenticates
 *      `connection.remotePeer` cryptographically — a peer ID is a public-key hash, so
 *      claiming one requires the private key. `authorizeStreamPeer` then requires it to equal
 *      the pinned `partnerPeerId`. Persisted state alone produces no stream and flips nothing.
 *   2. **Agreement with the persisted address.** On this path the CONNECT's relayer address
 *      must equal the relayer already on file (see `matchesPairedRelayer`). At
 *      `wait-for-connection` there is nothing to compare against and the address is adopted;
 *      here there is, and a partner that names a DIFFERENT forwarder mid-flow is refused
 *      rather than believed. So this path is strictly harder to satisfy than the original one.
 *   3. **The flag itself is still never persisted.** A reload always starts from false and has
 *      to earn it again.
 *
 * IS PEER IDENTITY ALONE SUFFICIENT? No, and it is not relied on alone. It is a genuine
 * cryptographic authentication — far stronger than a localStorage string — but the pin it is
 * checked against lives in localStorage, so an attacker who can WRITE that profile could
 * point it at a peer they control and dial. Check (2) is what that attacker then has to beat
 * as well, and it is why the address comparison is not optional here. Worth stating plainly:
 * that same attacker already wins today without any of this, by clearing the store and taking
 * the trust-on-first-use race at `wait-for-connection` that `peerGuard` documents as the
 * deliberately cheaper one to lose. This path does not widen that exposure; it declines to
 * add a second, quieter one.
 */

import type { Libp2p } from 'libp2p';

import { logger } from '@/lib/logger';
import { getPeerConnection, passStreamData } from './libp2p';
import { PROTOCOLS } from './protocols';
import type { StreamMessage } from '@swr/p2p';
import type { RegistrationStep } from '@/stores/registrationStore';
import type { TransactionRegistrationStep } from '@/stores/transactionRegistrationStore';

/**
 * How long to wait for the partner's answering CONNECT before telling the user.
 *
 * The same 30s `WaitForConnectionStep` and `resignAck` use, deliberately: it is the same
 * question over the same transport — did the peer actually act on what I wrote?
 */
export const REHANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Wallet-flow steps at which a re-handshake is admitted and attempted.
 *
 * The two sign steps and nothing else. Provenance gates exactly one thing — signing — so
 * these are the only steps where its absence is a dead end, and a bound set of two is the
 * smallest change that clears it. In particular:
 *
 *   - `grace-period` is excluded. Nothing there needs provenance, and the anti-phishing delay
 *     is not a place to widen what a peer may act at, even for a message that cannot move the
 *     step machine.
 *   - `success` is excluded because it is terminal.
 *   - the payment steps are excluded because the victim signs nothing there; a connection lost
 *     at one is handled by `ReconnectDialog`, and the flow reaches a sign step next, where the
 *     attempt fires.
 */
export const REHANDSHAKE_WALLET_STEPS: readonly RegistrationStep[] = [
  'acknowledge-and-sign',
  'register-and-sign',
];

/** The transaction flow's {@link REHANDSHAKE_WALLET_STEPS}. */
export const REHANDSHAKE_TX_STEPS: readonly TransactionRegistrationStep[] = [
  'acknowledge-sign',
  'register-sign',
];

export interface NeedsRehandshakeInput<TStep extends string> {
  /** The flow's current step. */
  step: TStep | null;
  /** The pinned partner, or null when there is nobody to re-handshake with. */
  partnerPeerId: string | null;
  /** `relayerFromPeerSession` / `forwarderFromPeerSession`. */
  provenanceOk: boolean;
  /** {@link REHANDSHAKE_WALLET_STEPS} or {@link REHANDSHAKE_TX_STEPS}. */
  rehandshakeSteps: readonly TStep[];
}

/**
 * Whether this side is sitting in the dead end and should ask for a fresh handshake.
 *
 * Pure, so the condition is testable without a peer, a node or a render.
 *
 * Requires a pinned partner rather than treating its absence as a reason to try harder: with
 * no pin there is nobody to dial, and nothing an unauthenticated peer could send would be
 * accepted anyway. That case is a genuine restart, and the UI says so instead of retrying.
 */
export function needsRehandshake<TStep extends string>({
  step,
  partnerPeerId,
  provenanceOk,
  rehandshakeSteps,
}: NeedsRehandshakeInput<TStep>): boolean {
  if (provenanceOk) return false;
  if (!partnerPeerId) return false;
  if (!step) return false;
  return rehandshakeSteps.includes(step);
}

/**
 * Whether an inbound CONNECT may confer provenance on `relayer`.
 *
 * At the pairing step there is nothing on file yet, so the address is being learned and any
 * well-formed one is adopted — the existing behaviour. Past it, an address IS on file: the
 * acknowledgement already on chain names it, so a partner reporting a different forwarder is
 * either a different party or a compromised one, and either way its claim must not overwrite
 * what the flow already committed to.
 *
 * @param isPairingStep - true only at `wait-for-connection` (use `isPreConnectionStep`)
 * @param claimed - the relayer address from the CONNECT payload
 * @param onFile - the relayer address already in the form store, if any
 */
export function matchesPairedRelayer(
  isPairingStep: boolean,
  claimed: string,
  onFile: string | null | undefined
): boolean {
  if (isPairingStep) return true;
  if (!onFile) return false;
  return claimed.toLowerCase() === onFile.toLowerCase();
}

export interface SendRehandshakeConnectInput {
  getLibp2p: () => Libp2p | null;
  /** The pinned partner to dial. */
  partnerPeerId: string | null;
  /** The CONNECT payload — the local side's own address, never a value from the wire. */
  streamData: StreamMessage;
}

/**
 * Dial the pinned partner and send a CONNECT asking them to re-assert the handshake.
 *
 * Never throws: a peer that has closed its tab is an expected outcome here, not an exception,
 * and the caller turns `false` into copy the user can act on.
 *
 * A resolved write is NOT success — a peer can drop the stream silently. Success is the
 * partner's answering CONNECT flipping the provenance flag, which the caller observes.
 *
 * @returns true only if the request was written to the partner's stream
 */
export async function sendRehandshakeConnect({
  getLibp2p,
  partnerPeerId,
  streamData,
}: SendRehandshakeConnectInput): Promise<boolean> {
  const libp2p = getLibp2p();
  if (!libp2p || !partnerPeerId) {
    logger.p2p.warn('Cannot re-handshake: no node or no pinned partner', {
      hasLibp2p: !!libp2p,
      hasPartner: !!partnerPeerId,
    });
    return false;
  }

  try {
    const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });
    await passStreamData({ connection, protocols: [PROTOCOLS.CONNECT], streamData });
    logger.p2p.info('Sent re-handshake CONNECT to the pinned partner', { partnerPeerId });
    return true;
  } catch (err) {
    logger.p2p.warn('Could not reach the pinned partner to re-handshake', {
      partnerPeerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * What to tell the user when the re-handshake did not complete.
 *
 * Says what is actually true and what actually works. The old copy — "Please reconnect to your
 * relayer before signing" — named a recovery that did not exist anywhere in the app.
 */
export const REHANDSHAKE_FAILED_MESSAGE =
  'Could not re-establish the verified connection to your relayer, so signing is blocked. Ask them to keep this registration open in their browser, then reload this page to try again. If they have closed it, you will both need to start over.';

/**
 * What to tell the user at the moment they try to sign without a verified connection.
 *
 * Distinct from {@link REHANDSHAKE_FAILED_MESSAGE}: reconnection may still be in flight when
 * they click, and this says so rather than declaring failure.
 */
export const SIGN_BLOCKED_MESSAGE =
  'Your relayer connection has not been verified in this session, so this signature is blocked. Reconnecting happens automatically — wait a moment and try again. If it does not clear, ask your relayer to keep their page open and reload this one.';

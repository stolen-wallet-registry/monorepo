/**
 * Recovery for a signature-invalidating revert on a **P2P relayed** pay step.
 *
 * The non-P2P pay steps already implement the rule established by S3/E19: a Retry after a
 * revert that invalidates the signature must DISCARD the signature and restart, never
 * resubmit byte-identical calldata. `RegistrationPayStep`/`TxRegisterPayStep` do that by
 * calling `removeSignature` and sending the *same user* back to the sign step.
 *
 * The P2P path cannot do that, because the signature lives on the PARTNER's machine. The
 * relayer holds a copy it can delete, but it cannot produce a replacement — only the
 * registeree/reporter, who is sitting on a different device watching a "waiting for the
 * relayer" screen, can. So P2P recovery is three things rather than one:
 *
 *   1. discard the relayed signature locally, so no button can resubmit it;
 *   2. ask the partner to sign again, over the wire;
 *   3. move the relayer back to the step at which a fresh signature from the partner is
 *      accepted — `protocolSteps.ts` rejects a signature that arrives at the wrong step, so
 *      skipping this leaves the relayer silently dropping the very message it asked for.
 *
 * This module owns (1)'s decision and (2)'s wire call. The components own the navigation.
 *
 * ── COUNTERPART (landed) ─────────────────────────────────────────────────────────────────
 * The wire protocol is registered as `PROTOCOLS.RESIGN_REQ` in `@swr/p2p`, carries a
 * required machine-readable `reason` (`ResignRequestMessageSchema`), is admitted by the
 * receiver-side ordering tables in `lib/p2p/protocolSteps.ts` at the two payment steps only,
 * and is handled by the registeree and reporter pages. {@link resignTargetStep} /
 * {@link txResignTargetStep} below are the receiver's half of the decision: they map
 * (current step, reason) to the ONE step the flow may move back to, so no peer-supplied
 * value ever names a destination.
 *
 * Delivery is still not guaranteed — a peer can be unreachable — so every caller must keep
 * handling `false` from {@link sendResignRequest} by telling the human to contact their
 * partner directly.
 */

import type { Libp2p } from 'libp2p';
import { PROTOCOLS, type ResignReason } from '@swr/p2p';

import { getPeerConnection, passStreamData } from '@/lib/p2p';
import { isSignatureInvalidatingError } from '@/lib/errors/signatureInvalidation';
import { logger } from '@/lib/logger';
import type { RegistrationStep } from '@/stores/registrationStore';
import type { TransactionRegistrationStep } from '@/stores/transactionRegistrationStore';

/**
 * Why the partner has to sign again.
 *
 * - `signature-invalidated`: the signature itself is unusable (stale deadline, consumed
 *   nonce, expired forwarder).
 * - `window-closed`: the acknowledgement's on-chain registration window closed. No new
 *   *registration* signature can succeed — the two-phase flow restarts from phase one.
 *
 * Defined in `@swr/p2p` alongside the schema that validates it, and re-exported here so the
 * callers that already import from this module do not need a second import.
 */
export type { ResignReason };

/** Which flow the request belongs to — only affects the human-readable text. */
export type ResignFlow = 'wallet' | 'transaction';

/** What Retry should do on a P2P pay step. */
export type P2PRetryAction =
  /** Nothing about the signature is wrong; resubmitting can succeed (gas, RPC, EOA nonce). */
  | { kind: 'resubmit' }
  /** The signature is dead. Discard it and ask the partner for a new one. */
  | {
      kind: 'request-resign';
      reason: ResignReason;
      /**
       * True when the acknowledgement must be redone too. A closed window means the
       * acknowledgement it belonged to is spent, so its signature is discarded with the
       * registration one and the partner restarts from phase one.
       */
      discardAcknowledgement: boolean;
    };

/**
 * Decide what Retry means for the failure currently on screen.
 *
 * Mirrors `RegistrationPayStep`'s branching exactly — unrecognised errors stay retryable,
 * signature-invalidating ones do not — and adds the window-closed distinction that separates
 * "sign again" from "start again". Pure, so the rule is testable without a wallet, a peer or
 * a chain.
 *
 * @param isError - whether the write hook is currently in its error state
 * @param error - the error it failed with
 * @param windowClosed - on-chain: an acknowledgement exists and its window has expired.
 *   Only meaningful on a registration step; pass false (the default) on acknowledgement steps,
 *   where there is no prior window to have closed.
 */
export function classifyP2PRetry({
  isError,
  error,
  windowClosed = false,
}: {
  isError: boolean;
  error: unknown;
  windowClosed?: boolean;
}): P2PRetryAction {
  if (!isError || !isSignatureInvalidatingError(error)) {
    return { kind: 'resubmit' };
  }

  if (windowClosed) {
    return { kind: 'request-resign', reason: 'window-closed', discardAcknowledgement: true };
  }

  return { kind: 'request-resign', reason: 'signature-invalidated', discardAcknowledgement: false };
}

/**
 * The wire text for a re-sign request.
 *
 * Prose for logs and for a human reading a debug panel. It is NOT what the receiver acts on
 * — `reason` is — and receivers must not render it: it is peer-supplied text that would
 * otherwise be shown verbatim to a fraud victim mid-flow. The `${reason}: ` machine prefix
 * this string used to carry is gone; the structured field replaced it, and no legacy sender
 * exists to be tolerant of, because the protocol failed negotiation on every prior attempt
 * and nothing ever reached a receiver.
 */
export function resignRequestMessage(reason: ResignReason, flow: ResignFlow): string {
  const subject = flow === 'wallet' ? 'wallet registration' : 'transaction batch registration';

  return reason === 'window-closed'
    ? `The ${subject} window closed before the transaction landed. The acknowledgement has to be redone: please sign the acknowledgement again.`
    : `The signature you sent can no longer be used for this ${subject}. Please sign again.`;
}

/**
 * Read the reason off an inbound re-sign request.
 *
 * `ResignRequestMessageSchema` already rejects a request whose `reason` is absent or outside
 * the enum, so by the time a handler runs this is a re-check rather than the only check. It
 * stays because the value selects a recovery path, the narrowing is what makes the rest of
 * the receiver total, and a schema that is edited to relax the field should not silently
 * widen what the pages will act on.
 *
 * Fails closed: anything unrecognised yields null and the caller drops the request.
 */
export function parseResignReason(reason: unknown): ResignReason | null {
  return reason === 'window-closed' || reason === 'signature-invalidated' ? reason : null;
}

/**
 * The ONE step a wallet-flow re-sign request may move the registeree back to.
 *
 * This is the whole bound on the only backwards transition an inbound message can cause, so
 * it is a pure total function of the receiver's OWN current step plus a two-valued enum:
 * nothing the peer sends names a destination, and there is no input for which it returns a
 * step outside `{acknowledge-and-sign, register-and-sign}`.
 *
 * - At `acknowledgement-payment` only the acknowledgement signature is in flight, so both
 *   reasons recover the same way. A `window-closed` claim here is not honoured as a
 *   restart-from-phase-one, because there is no completed acknowledgement to have expired.
 * - At `registration-payment`, `window-closed` returns to the acknowledgement sign step.
 *   That is the one cross-phase move, and it is deliberately allowed: the acknowledgement's
 *   nonce is spent and its window shut, so no registration signature can ever succeed and
 *   staying in phase two deadlocks. It moves BACKWARDS to the start of the two-phase flow,
 *   which re-imposes every control (fresh acknowledgement signature, a fresh on-chain
 *   randomised grace period, a fresh registration signature) rather than skipping any.
 * - Every other step returns null and the request is ignored. `protocolSteps.ts` already
 *   refuses to deliver one outside the two payment steps; this repeats the bound so the
 *   navigation cannot be widened by a future edit to a table somewhere else.
 */
export function resignTargetStep(
  currentStep: RegistrationStep | null,
  reason: ResignReason
): RegistrationStep | null {
  if (currentStep === 'acknowledgement-payment') return 'acknowledge-and-sign';
  if (currentStep === 'registration-payment') {
    return reason === 'window-closed' ? 'acknowledge-and-sign' : 'register-and-sign';
  }
  return null;
}

/**
 * The transaction flow's {@link resignTargetStep}.
 *
 * Same bound, same reasoning; the destinations are the transaction flow's own sign steps.
 * Note it returns `acknowledge-sign`, never `select-transactions`: the reporter re-signs the
 * batch it already chose. Re-opening the selection would change the `dataHash` the relayer
 * is waiting on, and it is not something a peer should be able to push the reporter into.
 * The relayer sits at `select-transactions` in that situation only because that is where its
 * own table admits `TX_ACK_SIG`; the two are compatible.
 */
export function txResignTargetStep(
  currentStep: TransactionRegistrationStep | null,
  reason: ResignReason
): TransactionRegistrationStep | null {
  if (currentStep === 'acknowledgement-payment') return 'acknowledge-sign';
  if (currentStep === 'registration-payment') {
    return reason === 'window-closed' ? 'acknowledge-sign' : 'register-sign';
  }
  return null;
}

/**
 * How many re-sign requests one flow will honour before it stops.
 *
 * Each honoured request costs the victim a wallet signing prompt, and the sender is the only
 * party who decides when to send one. Without a ceiling a bound partner — the relayer is by
 * construction *not* trusted with anything but gas — could hold a victim in an unbounded
 * sign-again loop, which is signature fatigue as a service: exactly the conditioning the
 * two-phase flow exists to prevent.
 *
 * Three is chosen over one because genuine repeats are real (a second stale nonce, then a
 * window that closes during the retry), and over "unbounded" because nothing legitimate
 * needs a fourth. The counter spans both phases and is never reset by a successful re-sign,
 * so the attacker cannot recharge it by letting one recovery complete.
 */
export const MAX_RESIGN_REQUESTS = 3;

/**
 * Copy shown to the victim on receipt.
 *
 * Generated locally from the validated `reason`. The peer's `message` is never rendered.
 */
export function resignNoticeForRecipient(reason: ResignReason, flow: ResignFlow): string {
  const subject = flow === 'wallet' ? 'wallet registration' : 'transaction report';

  return reason === 'window-closed'
    ? `Your relayer reported that the ${subject} window closed before the transaction was confirmed. You will need to sign the acknowledgement again to restart. If you did not expect this, stop and check with your relayer before signing.`
    : `Your relayer reported that your signature can no longer be used for this ${subject} and has asked you to sign again. If you did not expect this, stop and check with your relayer before signing.`;
}

/**
 * Best-effort: tell the partner their signature is dead and they must sign again.
 *
 * Never throws. Delivery is not guaranteed and, until the counterpart lands, is expected to
 * fail — so the boolean matters: `false` means the human has to be told out of band, and the
 * caller must say so rather than leaving the partner waiting on a screen that will never
 * advance. The local signature is discarded by the caller either way; that part does not
 * depend on the network.
 *
 * @returns true only if the request was written to the partner's stream
 */
export async function sendResignRequest({
  getLibp2p,
  partnerPeerId,
  reason,
  flow,
}: {
  getLibp2p: () => Libp2p | null;
  partnerPeerId: string | null;
  reason: ResignReason;
  flow: ResignFlow;
}): Promise<boolean> {
  const libp2p = getLibp2p();

  if (!libp2p || !partnerPeerId) {
    logger.p2p.warn('Cannot send re-sign request: no peer to send it to', {
      hasLibp2p: !!libp2p,
      hasPartner: !!partnerPeerId,
      reason,
    });
    return false;
  }

  try {
    const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });

    await passStreamData({
      connection,
      protocols: [PROTOCOLS.RESIGN_REQ],
      // `reason` is what the partner acts on; `message` is prose for logs. Both are inside
      // `ResignRequestMessageSchema`, so a partner running this build accepts it and one
      // running an older build rejects it at the schema rather than acting on half of it.
      streamData: { success: false, reason, message: resignRequestMessage(reason, flow) },
    });

    logger.p2p.info('Sent re-sign request to partner', { reason, flow, partnerPeerId });
    return true;
  } catch (err) {
    logger.p2p.error(
      'Failed to send re-sign request to partner',
      { reason, flow, partnerPeerId },
      err instanceof Error ? err : undefined
    );
    return false;
  }
}

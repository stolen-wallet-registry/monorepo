/**
 * Record of which signatures THIS side actually produced and put on the wire.
 *
 * SECURITY (audit V3, ordering half). `ACK_REC` / `REG_REC` (and their `TX_` twins) are the
 * relayer's "got it" receipts. They carry no payload at all, and the receiving pages advanced
 * the flow on their arrival alone. `protocolSteps.ts` later bounded each one to a single step,
 * which stopped the walk-to-success bug — but a receipt is still honoured at the sign step
 * *before* the victim has signed anything. So a partner that sends `ACK_REC` early pushes the
 * victim off `acknowledge-and-sign` having produced no signature; chained with a forged
 * `ACK_PAY` and the local grace-period timer, the whole two-phase flow can be walked to
 * `registration-payment` with zero signatures in existence, where it stalls forever.
 *
 * Ordering was the missing property there, and correlation is the missing one here: a receipt
 * is only meaningful as an acknowledgement of something WE sent. This module is that memory.
 *
 * Deliberately module state rather than a store:
 *   - it must be readable synchronously from inside a long-lived libp2p protocol handler, which
 *     closes over nothing and cannot subscribe to React state;
 *   - it must NOT be persisted. A latch restored from an earlier session would authorize an
 *     advance for a signature this session never produced, which is the bug with extra steps.
 *     A reload rebuilds the node and re-runs the handshake, so there is nothing to carry over.
 */

/** Which signature a receipt would be acknowledging. */
export type SentSignatureKind = 'wallet-ack' | 'wallet-reg' | 'tx-ack' | 'tx-reg';

const sent = new Set<SentSignatureKind>();

/**
 * Record that this side signed and sent `kind`.
 *
 * Called from the sign steps once the signature exists, NOT when signing is requested: a
 * prompt the user dismissed must not unlock the receipt.
 */
export function markSignatureSent(kind: SentSignatureKind): void {
  sent.add(kind);
}

/** Whether this side has produced and sent `kind` in this session. */
export function hasSentSignature(kind: SentSignatureKind): boolean {
  return sent.has(kind);
}

/**
 * Forget everything sent, for a flow that is starting over.
 *
 * Called when a page returns to its pre-connection step. Without it, a second run in the same
 * tab would begin with the previous run's latches already set — which is exactly the stale
 * authorization this module exists to prevent.
 */
export function resetSentSignatures(): void {
  sent.clear();
}

/**
 * Forget one kind, for a re-sign that has been requested but not yet produced.
 *
 * A `RESIGN_REQ` sends the flow back to a sign step, so the latch for that step has to be
 * cleared or the receipt gate is already open for a signature that no longer exists.
 */
export function clearSentSignature(kind: SentSignatureKind): void {
  sent.delete(kind);
}

/**
 * Whether a receipt may advance the flow.
 *
 * Split out as a pure function so the rule is testable without a page, a peer or a chain, and
 * so both flows are provably applying the same one. Fails closed: an unknown kind, or a receipt
 * for something never sent, does not advance.
 *
 * @param kind - The signature the arriving receipt claims to acknowledge
 */
export function receiptMayAdvance(kind: SentSignatureKind): boolean {
  return hasSentSignature(kind);
}

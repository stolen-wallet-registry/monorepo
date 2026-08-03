/**
 * Which flow step each inbound P2P protocol is allowed to act on.
 *
 * The step machine advanced by calling `goToNextStep()` — one position along a linear
 * sequence — with no correlation to which message triggered it. `ACK_REC` and `REG_REC`
 * carry no payload at all, so five `/swr/acknowledgement/signature/1.0.0/received` streams
 * walked a victim from `acknowledge-and-sign` through `grace-period`, `register-and-sign`
 * and `registration-payment` to `success`: a fraud victim looking at a success screen for a
 * registration that never happened, with an explorer link to a transaction that never
 * existed. It also strands a victim who genuinely paid, by pushing the flow past the
 * grace-period window their acknowledgement is bound to.
 *
 * Connection binding (`peerGuard`) is not sufficient on its own here. It establishes that
 * the message came from the bound partner; it says nothing about whether the message makes
 * sense right now. A partner that repeats a message — or is itself compromised — still
 * drives the machine. Ordering is a separate property from authenticity, so it gets a
 * separate check.
 *
 * The rule: a protocol may only advance the flow from the step at which that message
 * legitimately arrives. Anything else is ignored and logged.
 *
 * ── Why the receiver-side tables hold a SET of steps ──────────────────────────────────────
 * Every table here mapped a protocol to exactly one step, which was true of every protocol
 * until `RESIGN_REQ`: a relayer whose relayed signature was invalidated by a revert can be
 * standing at either payment step when it discovers it, so the request is legitimate at two.
 * The value type widened to a list rather than the check loosening — each protocol still
 * names an explicit, closed set, membership is still exact, and both fail-closed paths are
 * unchanged (unknown protocol → false, unknown/absent step → false). An empty or non-array
 * entry is also false, so a malformed table cannot open the gate either.
 *
 * The two RELAYER tables are deliberately NOT widened. They keep the single-step shape, and
 * the two protocols that genuinely need a set — `RESIGN_ACK` and `CONNECT` — each get their
 * own named constant checked ahead of the table lookup. Widening the value type instead would
 * hand every other entry latitude none of them needs, for the convenience of two that do.
 */

import { PROTOCOLS } from '@swr/p2p';
import { RESIGN_ACK } from './resignAck';
import { REHANDSHAKE_WALLET_STEPS, REHANDSHAKE_TX_STEPS } from './rehandshake';
import type { RegistrationStep } from '@/stores/registrationStore';
import type { TransactionRegistrationStep } from '@/stores/transactionRegistrationStore';

/**
 * The steps at which a CONNECT may act, on either side of either flow.
 *
 * `wait-for-connection` is the original pairing. The rest are the sign steps, added so a side
 * that reloaded mid-flow can re-run the handshake in place instead of dead-ending — see
 * `rehandshake.ts` for why that does not weaken the provenance gate, and for why the set stops
 * at the sign steps rather than covering the whole flow.
 *
 * Widening this costs no ordering property, which is the reason it is safe where widening any
 * other protocol would not be: CONNECT is the one message whose handler advances nothing. Both
 * victim pages leave the advance to `WaitForConnectionStep` (rendered only at
 * `wait-for-connection`), and both relayer pages say so explicitly. Every other protocol in
 * these tables either calls `goToNextStep` or hands a signature to a step that will.
 */
const CONNECT_STEPS: readonly RegistrationStep[] = [
  'wait-for-connection',
  ...REHANDSHAKE_WALLET_STEPS,
];

/** The transaction flow's {@link CONNECT_STEPS}. */
const TX_CONNECT_STEPS: readonly TransactionRegistrationStep[] = [
  'wait-for-connection',
  ...REHANDSHAKE_TX_STEPS,
];

/**
 * The steps at which the relayer may accept the answer to a re-sign request.
 *
 * The two relayer tables below are deliberately single-step, and `RESIGN_ACK` is legitimate at
 * both payment steps — the relayer discovers a dead signature at either one. Rather than
 * widening those tables (which would buy latitude for every other protocol in them), the one
 * protocol that needs a set gets its own.
 *
 * The bound is narrow because it is cheap to make narrow, not because much rides on it: a
 * `RESIGN_ACK` only settles a promise the relayer is already awaiting, and one nobody armed is
 * dropped by `publishResignAck`. It cannot move the flow on its own.
 */
export const RESIGN_ACK_RELAYER_STEPS: readonly RegistrationStep[] = [
  'acknowledgement-payment',
  'registration-payment',
];

/** The transaction flow's {@link RESIGN_ACK_RELAYER_STEPS}. */
export const TX_RESIGN_ACK_RELAYER_STEPS: readonly TransactionRegistrationStep[] = [
  'acknowledgement-payment',
  'registration-payment',
];

/**
 * The steps the victim may be on when each relayer message legitimately arrives.
 *
 * Mirrors `STEP_SEQUENCES.p2pRelay`: each entry lists the step(s) the message may act from.
 * `grace-period` and `success` appear nowhere because nothing the relayer sends may move
 * the flow out of them — the grace period ends on the local timer, and `success` is
 * terminal.
 *
 * Two entries hold more than one step, for unrelated reasons.
 *
 * `RESIGN_REQ` is the only message that moves the flow BACKWARDS. Both payment steps are
 * listed because that is where the registeree waits while the relayer is spending gas, which
 * is the only window in which the relayer can discover the signature is dead. It is absent
 * from every other step for the usual reason: at `acknowledge-and-sign`/`register-and-sign`
 * there is nothing to recover (the victim is already being asked to sign), and admitting it at
 * `grace-period` would hand a peer the ability to pull a victim out of the anti-phishing delay.
 *
 * `CONNECT` is the message that moves the flow NOWHERE — see {@link CONNECT_STEPS}. Its extra
 * steps buy a re-handshake after a reload, not latitude: the handler sets provenance and
 * replies, and cannot touch the step machine on either side.
 */
export const PROTOCOL_EXPECTED_STEP: Readonly<Record<string, readonly RegistrationStep[]>> = {
  [PROTOCOLS.CONNECT]: CONNECT_STEPS,
  [PROTOCOLS.ACK_REC]: ['acknowledge-and-sign'],
  [PROTOCOLS.ACK_PAY]: ['acknowledgement-payment'],
  [PROTOCOLS.REG_REC]: ['register-and-sign'],
  [PROTOCOLS.REG_PAY]: ['registration-payment'],
  [PROTOCOLS.RESIGN_REQ]: ['acknowledgement-payment', 'registration-payment'],
};

/**
 * Exact membership in a protocol's expected-step set, or false if there is no usable set.
 *
 * Rejects a non-array lookup as well as a missing one: a table is an object literal, so
 * `table['toString']` resolves through `Object.prototype` to a function. `protocol` is
 * always one of the strings this app registered a handler for, never peer-supplied, so that
 * is not reachable today — but a truthy non-array would throw rather than fail closed, and
 * a guard that only holds while an unrelated call site stays correct is not a guard.
 */
function stepIsExpected<TStep extends string>(
  table: Readonly<Record<string, readonly TStep[]>>,
  protocol: string,
  step: TStep | null
): boolean {
  if (!step) return false;
  const expected = Object.prototype.hasOwnProperty.call(table, protocol)
    ? table[protocol]
    : undefined;
  if (!Array.isArray(expected) || expected.length === 0) return false;
  return expected.includes(step);
}

/**
 * Whether a message on `protocol` may act on the flow while it sits at `step`.
 *
 * Fails closed twice over: an unrecognized protocol and an unknown current step both return
 * false, so a new protocol added without a corresponding entry here is inert rather than
 * silently able to drive the machine.
 *
 * @param protocol - Protocol the message arrived on
 * @param step - The victim's current flow step
 */
export function isProtocolExpectedAtStep(protocol: string, step: RegistrationStep | null): boolean {
  return stepIsExpected(PROTOCOL_EXPECTED_STEP, protocol, step);
}

/**
 * The relayer's side of the wallet flow.
 *
 * The relayer runs the same step sequence as the registeree but receives the opposite half of
 * the protocol set, so it needs its own table: the registeree-facing entries above would
 * reject every message the relayer actually gets. Without a table the relayer had no ordering
 * check at all, and a bound partner could walk it forward one step per repeated CONNECT — the
 * same defect this module exists to close, on the side that spends the gas.
 *
 * Single step per protocol, unlike the receiver-side tables above. `RESIGN_REQ` is absent on
 * purpose: the relayer sends re-sign requests, it never receives them, and the page registers
 * no handler for one. Listing it would only give a registeree a way to walk the relayer
 * backwards through the flow that spends the gas.
 *
 * CONNECT is absent from this table for the same shape reason `RESIGN_ACK` is: it needs a set,
 * and it gets its own rather than widening the value type for every entry. It is the relayer
 * that ANSWERS a re-handshake — the victim reloaded, so the victim dials — which is why the
 * relayer has to admit one at the sign steps too. See {@link CONNECT_RELAYER_STEPS}.
 */
export const RELAYER_PROTOCOL_EXPECTED_STEP: Readonly<Record<string, RegistrationStep>> = {
  [PROTOCOLS.ACK_SIG]: 'acknowledge-and-sign',
  [PROTOCOLS.REG_SIG]: 'register-and-sign',
};

/**
 * The steps at which the relayer accepts a CONNECT.
 *
 * `wait-for-connection` is its own dial being answered. The sign steps are the victim asking
 * to re-handshake after a reload; the relayer sits at the matching sign step throughout,
 * because the two sides advance in lockstep across the sign phase (the relayer leaves
 * `acknowledge-and-sign` only when it receives ACK_SIG, which is what the victim sends
 * immediately after signing).
 *
 * Admitting CONNECT here cannot walk the relayer forward — the defect this module was written
 * for. `WaitForConnectionStep` owns that advance and is rendered only at `wait-for-connection`;
 * the relayer's CONNECT handler advances nothing on its own.
 */
export const CONNECT_RELAYER_STEPS: readonly RegistrationStep[] = [
  'wait-for-connection',
  ...REHANDSHAKE_WALLET_STEPS,
];

/** The transaction flow's {@link CONNECT_RELAYER_STEPS}. */
export const TX_CONNECT_RELAYER_STEPS: readonly TransactionRegistrationStep[] = [
  'wait-for-connection',
  ...REHANDSHAKE_TX_STEPS,
];

/**
 * Whether a wallet-flow message on `protocol` may act while the relayer sits at `step`.
 *
 * Same fail-closed behaviour as {@link isProtocolExpectedAtStep}.
 */
export function isRelayerProtocolExpectedAtStep(
  protocol: string,
  step: RegistrationStep | null
): boolean {
  if (!step) return false;
  if (protocol === RESIGN_ACK) return RESIGN_ACK_RELAYER_STEPS.includes(step);
  if (protocol === PROTOCOLS.CONNECT) return CONNECT_RELAYER_STEPS.includes(step);
  const expected = RELAYER_PROTOCOL_EXPECTED_STEP[protocol];
  if (!expected) return false;
  return expected === step;
}

/**
 * The transaction flow's equivalent of {@link PROTOCOL_EXPECTED_STEP}.
 *
 * The transaction registration flow is a separate step machine with its own store, its own
 * step names and its own protocols (`TX_*`), and it had the same defect: `TX_ACK_REC` and
 * `TX_REG_REC` carry no payload and advanced the flow unconditionally.
 *
 * Mirrors `TX_STEP_SEQUENCES.p2pRelay`. `select-transactions` is absent deliberately — the
 * reporter chooses what to report locally, and no message from the relayer may move the flow
 * off that step. That includes `RESIGN_REQ`, which is admitted at the two payment steps only
 * and sends the reporter back to a *sign* step, never back into the selection.
 */
export const TX_PROTOCOL_EXPECTED_STEP: Readonly<
  Record<string, readonly TransactionRegistrationStep[]>
> = {
  [PROTOCOLS.CONNECT]: TX_CONNECT_STEPS,
  [PROTOCOLS.TX_ACK_REC]: ['acknowledge-sign'],
  [PROTOCOLS.TX_ACK_PAY]: ['acknowledgement-payment'],
  [PROTOCOLS.TX_REG_REC]: ['register-sign'],
  [PROTOCOLS.TX_REG_PAY]: ['registration-payment'],
  [PROTOCOLS.RESIGN_REQ]: ['acknowledgement-payment', 'registration-payment'],
};

/**
 * Whether a transaction-flow message on `protocol` may act while the flow sits at `step`.
 *
 * Same fail-closed behaviour as {@link isProtocolExpectedAtStep}.
 */
export function isTxProtocolExpectedAtStep(
  protocol: string,
  step: TransactionRegistrationStep | null
): boolean {
  return stepIsExpected(TX_PROTOCOL_EXPECTED_STEP, protocol, step);
}

/**
 * The transaction relayer's table — the mirror of {@link RELAYER_PROTOCOL_EXPECTED_STEP}.
 *
 * `TX_ACK_SIG` legitimately arrives while the relayer still sits at `select-transactions`: the
 * reporter chooses the batch locally, so the relayer has nothing to do at that step but wait,
 * and the signature message is what carries the batch to it. `processTxSignature` advances one
 * step and the handler advances a second time to reach `acknowledgement-payment`.
 *
 * CONNECT lives in {@link TX_CONNECT_RELAYER_STEPS} rather than here — see
 * {@link CONNECT_RELAYER_STEPS} for why it needs a set.
 */
export const TX_RELAYER_PROTOCOL_EXPECTED_STEP: Readonly<
  Record<string, TransactionRegistrationStep>
> = {
  [PROTOCOLS.TX_ACK_SIG]: 'select-transactions',
  [PROTOCOLS.TX_REG_SIG]: 'register-sign',
};

/**
 * Whether a transaction-flow message on `protocol` may act while the relayer sits at `step`.
 *
 * Same fail-closed behaviour as {@link isProtocolExpectedAtStep}.
 */
export function isTxRelayerProtocolExpectedAtStep(
  protocol: string,
  step: TransactionRegistrationStep | null
): boolean {
  if (!step) return false;
  if (protocol === RESIGN_ACK) return TX_RESIGN_ACK_RELAYER_STEPS.includes(step);
  if (protocol === PROTOCOLS.CONNECT) return TX_CONNECT_RELAYER_STEPS.includes(step);
  const expected = TX_RELAYER_PROTOCOL_EXPECTED_STEP[protocol];
  if (!expected) return false;
  return expected === step;
}

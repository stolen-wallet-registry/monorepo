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
 */

import { PROTOCOLS } from '@swr/p2p';
import type { RegistrationStep } from '@/stores/registrationStore';
import type { TransactionRegistrationStep } from '@/stores/transactionRegistrationStore';

/**
 * The step the victim is on when each relayer message legitimately arrives.
 *
 * Mirrors `STEP_SEQUENCES.p2pRelay`: each entry is the step the message advances *from*.
 * `grace-period` and `success` appear nowhere because nothing the relayer sends may move
 * the flow out of them — the grace period ends on the local timer, and `success` is
 * terminal.
 */
export const PROTOCOL_EXPECTED_STEP: Readonly<Record<string, RegistrationStep>> = {
  [PROTOCOLS.CONNECT]: 'wait-for-connection',
  [PROTOCOLS.ACK_REC]: 'acknowledge-and-sign',
  [PROTOCOLS.ACK_PAY]: 'acknowledgement-payment',
  [PROTOCOLS.REG_REC]: 'register-and-sign',
  [PROTOCOLS.REG_PAY]: 'registration-payment',
};

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
  if (!step) return false;
  const expected = PROTOCOL_EXPECTED_STEP[protocol];
  if (!expected) return false;
  return expected === step;
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
 * A CONNECT is only ever legitimate at `wait-for-connection`. Reconnection does not re-send
 * one (`ReconnectDialog` re-dials without a handshake), so gating it here does not break resume.
 */
export const RELAYER_PROTOCOL_EXPECTED_STEP: Readonly<Record<string, RegistrationStep>> = {
  [PROTOCOLS.CONNECT]: 'wait-for-connection',
  [PROTOCOLS.ACK_SIG]: 'acknowledge-and-sign',
  [PROTOCOLS.REG_SIG]: 'register-and-sign',
};

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
 * off that step.
 */
export const TX_PROTOCOL_EXPECTED_STEP: Readonly<Record<string, TransactionRegistrationStep>> = {
  [PROTOCOLS.CONNECT]: 'wait-for-connection',
  [PROTOCOLS.TX_ACK_REC]: 'acknowledge-sign',
  [PROTOCOLS.TX_ACK_PAY]: 'acknowledgement-payment',
  [PROTOCOLS.TX_REG_REC]: 'register-sign',
  [PROTOCOLS.TX_REG_PAY]: 'registration-payment',
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
  if (!step) return false;
  const expected = TX_PROTOCOL_EXPECTED_STEP[protocol];
  if (!expected) return false;
  return expected === step;
}

/**
 * The transaction relayer's table — the mirror of {@link RELAYER_PROTOCOL_EXPECTED_STEP}.
 *
 * `TX_ACK_SIG` legitimately arrives while the relayer still sits at `select-transactions`: the
 * reporter chooses the batch locally, so the relayer has nothing to do at that step but wait,
 * and the signature message is what carries the batch to it. `processTxSignature` advances one
 * step and the handler advances a second time to reach `acknowledgement-payment`.
 */
export const TX_RELAYER_PROTOCOL_EXPECTED_STEP: Readonly<
  Record<string, TransactionRegistrationStep>
> = {
  [PROTOCOLS.CONNECT]: 'wait-for-connection',
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
  const expected = TX_RELAYER_PROTOCOL_EXPECTED_STEP[protocol];
  if (!expected) return false;
  return expected === step;
}

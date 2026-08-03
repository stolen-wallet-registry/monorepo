/**
 * Tests for P2P protocol/step ordering.
 *
 * The failure being prevented: `goToNextStep()` advanced one position along the sequence
 * regardless of which message triggered it, so repeating a payload-free message walked a
 * victim to the success screen for a registration that never happened.
 */

import { describe, it, expect } from 'vitest';
import { PROTOCOLS } from '@swr/p2p';
import {
  isProtocolExpectedAtStep,
  isTxProtocolExpectedAtStep,
  isRelayerProtocolExpectedAtStep,
  isTxRelayerProtocolExpectedAtStep,
  PROTOCOL_EXPECTED_STEP,
  TX_PROTOCOL_EXPECTED_STEP,
  RELAYER_PROTOCOL_EXPECTED_STEP,
  TX_RELAYER_PROTOCOL_EXPECTED_STEP,
  CONNECT_RELAYER_STEPS,
  TX_CONNECT_RELAYER_STEPS,
} from './protocolSteps';
import { RESIGN_ACK } from './resignAck';
import { STEP_SEQUENCES } from '@/stores/registrationStore';
import { TX_STEP_SEQUENCES } from '@/stores/transactionRegistrationStore';

describe('isProtocolExpectedAtStep', () => {
  it('accepts each relayer message at the step it belongs to', () => {
    expect(isProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'acknowledge-and-sign')).toBe(true);
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_PAY, 'acknowledgement-payment')).toBe(true);
    expect(isProtocolExpectedAtStep(PROTOCOLS.REG_REC, 'register-and-sign')).toBe(true);
    expect(isProtocolExpectedAtStep(PROTOCOLS.REG_PAY, 'registration-payment')).toBe(true);
  });

  it('rejects a repeated ACK_REC — the walk to the success screen', () => {
    // The first ACK_REC legitimately moves the victim to acknowledgement-payment. Every
    // subsequent one now finds itself at the wrong step and does nothing.
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'acknowledge-and-sign')).toBe(true);
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'acknowledgement-payment')).toBe(false);
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'grace-period')).toBe(false);
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'register-and-sign')).toBe(false);
    expect(isProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'registration-payment')).toBe(false);
  });

  it('never lets a relayer message move the flow out of the grace period', () => {
    // The grace period is the anti-phishing delay. It ends on the local timer, never
    // because a peer said so.
    for (const protocol of Object.keys(PROTOCOL_EXPECTED_STEP)) {
      expect(isProtocolExpectedAtStep(protocol, 'grace-period')).toBe(false);
    }
  });

  it('never acts once the flow has reached success', () => {
    for (const protocol of Object.keys(PROTOCOL_EXPECTED_STEP)) {
      expect(isProtocolExpectedAtStep(protocol, 'success')).toBe(false);
    }
  });

  it('rejects a message that arrives before the flow has started', () => {
    expect(isProtocolExpectedAtStep(PROTOCOLS.REG_PAY, null)).toBe(false);
  });

  it('fails closed on an unregistered protocol', () => {
    // A protocol added without an entry here must be inert, not free to drive the machine.
    expect(isProtocolExpectedAtStep('/swr/not-a-real-protocol/1.0.0', 'acknowledge-and-sign')).toBe(
      false
    );
  });

  it('maps every protocol to steps that exist in the p2pRelay sequence', () => {
    // Guards against a typo silently making a protocol permanently inert.
    const sequence = STEP_SEQUENCES.p2pRelay;
    for (const [protocol, steps] of Object.entries(PROTOCOL_EXPECTED_STEP)) {
      expect(steps.length, `${protocol} has an empty step set`).toBeGreaterThan(0);
      for (const step of steps) {
        expect(sequence, `${protocol} maps to a step outside the p2pRelay flow`).toContain(step);
      }
    }
  });

  // Exactly two protocols hold a multi-step set, for opposite reasons, and every other one
  // keeps the original one-step-each shape — so widening the value type did not quietly widen
  // anyone else's gate. RESIGN_REQ is the only message that moves the flow BACKWARDS; CONNECT
  // is the only one that moves it NOWHERE.
  const MULTI_STEP_PROTOCOLS: Record<string, string[]> = {
    [PROTOCOLS.RESIGN_REQ]: ['acknowledgement-payment', 'registration-payment'],
    [PROTOCOLS.CONNECT]: ['acknowledge-and-sign', 'register-and-sign', 'wait-for-connection'],
  };

  it('gives exactly two protocols a multi-step set, each to its documented steps', () => {
    for (const [protocol, steps] of Object.entries(PROTOCOL_EXPECTED_STEP)) {
      const expected = MULTI_STEP_PROTOCOLS[protocol];
      if (expected) {
        expect([...steps].sort()).toEqual(expected);
      } else {
        expect(steps, `${protocol} must stay pinned to a single step`).toHaveLength(1);
      }
    }
  });

  it('keeps every single-step protocol on a distinct step', () => {
    // Two of them sharing a step would let one stand in for the other. The two multi-step
    // protocols overlap by design — RESIGN_REQ acts where the payment notifications act, and
    // CONNECT where the receipts do — but both are dispatched by protocol, not by step, and
    // neither handler can do what the overlapping one does.
    const steps = Object.entries(PROTOCOL_EXPECTED_STEP)
      .filter(([protocol]) => !MULTI_STEP_PROTOCOLS[protocol])
      .flatMap(([, value]) => value);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it('admits a re-sign request only while waiting on the relayer to pay', () => {
    expect(isProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, 'acknowledgement-payment')).toBe(true);
    expect(isProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, 'registration-payment')).toBe(true);

    // Nowhere else. In particular not the grace period (the anti-phishing delay is not
    // something a peer may pull a victim out of) and not `success` (terminal).
    for (const step of [
      'wait-for-connection',
      'acknowledge-and-sign',
      'grace-period',
      'register-and-sign',
      'success',
    ] as const) {
      expect(isProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, step)).toBe(false);
    }
    expect(isProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, null)).toBe(false);
  });

  // Regression guard for the widening itself: the table is an object literal, so a lookup of
  // an inherited key returns a function. Under the old `expected === step` check that was
  // harmlessly false; under a membership check it must not throw or pass.
  it('fails closed on inherited Object.prototype keys rather than throwing', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(isProtocolExpectedAtStep(key, 'acknowledgement-payment')).toBe(false);
      expect(isTxProtocolExpectedAtStep(key, 'acknowledgement-payment')).toBe(false);
      expect(isRelayerProtocolExpectedAtStep(key, 'acknowledge-and-sign')).toBe(false);
      expect(isTxRelayerProtocolExpectedAtStep(key, 'select-transactions')).toBe(false);
    }
  });
});

describe('isTxProtocolExpectedAtStep', () => {
  it('accepts each relayer message at the step it belongs to', () => {
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_ACK_REC, 'acknowledge-sign')).toBe(true);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_ACK_PAY, 'acknowledgement-payment')).toBe(true);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_REG_REC, 'register-sign')).toBe(true);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_REG_PAY, 'registration-payment')).toBe(true);
  });

  it('rejects a repeated TX_ACK_REC', () => {
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_ACK_REC, 'acknowledge-sign')).toBe(true);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_ACK_REC, 'acknowledgement-payment')).toBe(false);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_ACK_REC, 'success')).toBe(false);
  });

  it('never lets a relayer message move the flow out of the grace period', () => {
    for (const protocol of Object.keys(TX_PROTOCOL_EXPECTED_STEP)) {
      expect(isTxProtocolExpectedAtStep(protocol, 'grace-period')).toBe(false);
    }
  });

  it('never lets a relayer message move the reporter off transaction selection', () => {
    // What gets reported is chosen locally; the relayer has no say in it.
    for (const protocol of Object.keys(TX_PROTOCOL_EXPECTED_STEP)) {
      expect(isTxProtocolExpectedAtStep(protocol, 'select-transactions')).toBe(false);
    }
  });

  it('fails closed on an unregistered protocol and a null step', () => {
    expect(isTxProtocolExpectedAtStep('/swr/nope/1.0.0', 'acknowledge-sign')).toBe(false);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.TX_REG_PAY, null)).toBe(false);
  });

  it('maps every protocol to steps that exist in the p2pRelay tx sequence', () => {
    const sequence = TX_STEP_SEQUENCES.p2pRelay;
    for (const [protocol, steps] of Object.entries(TX_PROTOCOL_EXPECTED_STEP)) {
      expect(steps.length, `${protocol} has an empty step set`).toBeGreaterThan(0);
      for (const step of steps) {
        expect(sequence, `${protocol} maps to a step outside the tx p2pRelay flow`).toContain(step);
      }
    }
  });

  it('gives exactly two protocols a multi-step set, each to its documented steps', () => {
    // Mirrors the wallet flow: RESIGN_REQ moves the flow backwards, CONNECT moves it nowhere.
    const multiStep: Record<string, string[]> = {
      [PROTOCOLS.RESIGN_REQ]: ['acknowledgement-payment', 'registration-payment'],
      [PROTOCOLS.CONNECT]: ['acknowledge-sign', 'register-sign', 'wait-for-connection'],
    };
    for (const [protocol, steps] of Object.entries(TX_PROTOCOL_EXPECTED_STEP)) {
      const expected = multiStep[protocol];
      if (expected) {
        expect([...steps].sort()).toEqual(expected);
      } else {
        expect(steps, `${protocol} must stay pinned to a single step`).toHaveLength(1);
      }
    }
  });

  it('admits a re-sign request only while waiting on the relayer to pay', () => {
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, 'acknowledgement-payment')).toBe(true);
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, 'registration-payment')).toBe(true);

    for (const step of [
      'wait-for-connection',
      'select-transactions',
      'acknowledge-sign',
      'grace-period',
      'register-sign',
      'success',
    ] as const) {
      expect(isTxProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, step)).toBe(false);
    }
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, null)).toBe(false);
  });

  it('does not accept wallet-flow protocols', () => {
    // The two flows have distinct protocols; crossing them would let one drive the other.
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.ACK_REC, 'acknowledge-sign')).toBe(false);
    expect(isProtocolExpectedAtStep(PROTOCOLS.TX_ACK_REC, 'acknowledge-and-sign')).toBe(false);
  });
});

describe('isRelayerProtocolExpectedAtStep', () => {
  it('accepts each registeree message at the step the relayer receives it', () => {
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.ACK_SIG, 'acknowledge-and-sign')).toBe(true);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.REG_SIG, 'register-and-sign')).toBe(true);
  });

  it('admits CONNECT at the pairing step and the two sign steps, and nowhere else', () => {
    // The relayer used to advance on every CONNECT it accepted, so a bound partner could push
    // it into a payment step holding no signature at all. The advance is gone — it lives in
    // `WaitForConnectionStep`, which renders only at `wait-for-connection` — so CONNECT is now
    // the one protocol that can be admitted more widely without buying anyone latitude.
    //
    // The sign steps are here because the RELAYER answers a re-handshake: the victim is the
    // side that reloaded, so the victim dials (see `rehandshake.ts`). Everything else stays
    // shut, in particular the grace period and `success`.
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'acknowledge-and-sign')).toBe(true);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'register-and-sign')).toBe(true);

    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'acknowledgement-payment')).toBe(
      false
    );
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'grace-period')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'registration-payment')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'success')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, null)).toBe(false);
  });

  it('never lets a message move the relayer out of the grace period or off success', () => {
    // CONNECT is checked explicitly because it no longer lives in the table.
    for (const protocol of [...Object.keys(RELAYER_PROTOCOL_EXPECTED_STEP), PROTOCOLS.CONNECT]) {
      expect(isRelayerProtocolExpectedAtStep(protocol, 'grace-period')).toBe(false);
      expect(isRelayerProtocolExpectedAtStep(protocol, 'success')).toBe(false);
    }
  });

  it('fails closed on an unregistered protocol and a null step', () => {
    expect(isRelayerProtocolExpectedAtStep('/swr/nope/1.0.0', 'wait-for-connection')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.ACK_SIG, null)).toBe(false);
  });

  it('does not accept the registeree-facing half of the protocol set', () => {
    // The relayer never receives these; accepting one would mean a peer could drive the
    // relayer with messages only the relayer is supposed to send.
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.ACK_PAY, 'acknowledgement-payment')).toBe(
      false
    );
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.REG_PAY, 'registration-payment')).toBe(false);
  });

  it('maps every protocol to a step that exists in the p2pRelay sequence', () => {
    const sequence = STEP_SEQUENCES.p2pRelay;
    for (const [protocol, step] of Object.entries(RELAYER_PROTOCOL_EXPECTED_STEP)) {
      expect(sequence, `${protocol} maps to a step outside the p2pRelay flow`).toContain(step);
    }
  });

  // The relayer SENDS re-sign requests; it must never act on one. Widening the two
  // receiver-side tables must not have leaked into this one — a registeree that could walk
  // the relayer backwards would be walking the side that spends the gas.
  it('never admits a re-sign request, at any step', () => {
    for (const step of STEP_SEQUENCES.p2pRelay) {
      expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, step)).toBe(false);
    }
    expect(RELAYER_PROTOCOL_EXPECTED_STEP[PROTOCOLS.RESIGN_REQ]).toBeUndefined();
  });

  // The relayer table keeps one step per protocol; nothing it receives is legitimate twice.
  it('keeps a single step per protocol', () => {
    for (const [protocol, step] of Object.entries(RELAYER_PROTOCOL_EXPECTED_STEP)) {
      expect(typeof step, `${protocol} should be a bare step, not a set`).toBe('string');
    }
  });

  /**
   * The re-sign ACKNOWLEDGEMENT is the one thing the relayer receives at more than one step —
   * a dead signature is discovered at either payment step. It gets its own set rather than
   * widening the table above, which would buy latitude for every protocol in it.
   */
  it('admits the re-sign acknowledgement at both payment steps and nowhere else', () => {
    expect(isRelayerProtocolExpectedAtStep(RESIGN_ACK, 'acknowledgement-payment')).toBe(true);
    expect(isRelayerProtocolExpectedAtStep(RESIGN_ACK, 'registration-payment')).toBe(true);

    for (const step of STEP_SEQUENCES.p2pRelay) {
      if (step === 'acknowledgement-payment' || step === 'registration-payment') continue;
      expect(isRelayerProtocolExpectedAtStep(RESIGN_ACK, step)).toBe(false);
    }
    expect(isRelayerProtocolExpectedAtStep(RESIGN_ACK, null)).toBe(false);
  });

  // The ACK travels registeree → relayer only; admitting it on the receiver side would let a
  // relayer answer its own question.
  it('does not admit the re-sign acknowledgement on the receiver side', () => {
    for (const step of STEP_SEQUENCES.p2pRelay) {
      expect(isProtocolExpectedAtStep(RESIGN_ACK, step)).toBe(false);
    }
  });
});

describe('isTxRelayerProtocolExpectedAtStep', () => {
  it('accepts each reporter message at the step the relayer receives it', () => {
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    // The batch arrives with the signature while the relayer still waits at selection.
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.TX_ACK_SIG, 'select-transactions')).toBe(
      true
    );
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.TX_REG_SIG, 'register-sign')).toBe(true);
  });

  it('rejects a repeated CONNECT', () => {
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'select-transactions')).toBe(false);
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'acknowledgement-payment')).toBe(
      false
    );
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'success')).toBe(false);
  });

  it('fails closed on an unregistered protocol and a null step', () => {
    expect(isTxRelayerProtocolExpectedAtStep('/swr/nope/1.0.0', 'select-transactions')).toBe(false);
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.TX_ACK_SIG, null)).toBe(false);
  });

  it('does not accept the reporter-facing half, or wallet-flow protocols', () => {
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.TX_ACK_PAY, 'acknowledgement-payment')).toBe(
      false
    );
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.ACK_SIG, 'select-transactions')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.TX_ACK_SIG, 'acknowledge-and-sign')).toBe(
      false
    );
  });

  it('maps every protocol to a step that exists in the tx p2pRelay sequence', () => {
    const sequence = TX_STEP_SEQUENCES.p2pRelay;
    for (const [protocol, step] of Object.entries(TX_RELAYER_PROTOCOL_EXPECTED_STEP)) {
      expect(sequence, `${protocol} maps to a step outside the tx p2pRelay flow`).toContain(step);
    }
  });

  it('never admits a re-sign request, at any step', () => {
    for (const step of TX_STEP_SEQUENCES.p2pRelay) {
      expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.RESIGN_REQ, step)).toBe(false);
    }
    expect(TX_RELAYER_PROTOCOL_EXPECTED_STEP[PROTOCOLS.RESIGN_REQ]).toBeUndefined();
  });

  it('admits the re-sign acknowledgement at both payment steps and nowhere else', () => {
    expect(isTxRelayerProtocolExpectedAtStep(RESIGN_ACK, 'acknowledgement-payment')).toBe(true);
    expect(isTxRelayerProtocolExpectedAtStep(RESIGN_ACK, 'registration-payment')).toBe(true);

    for (const step of TX_STEP_SEQUENCES.p2pRelay) {
      if (step === 'acknowledgement-payment' || step === 'registration-payment') continue;
      expect(isTxRelayerProtocolExpectedAtStep(RESIGN_ACK, step)).toBe(false);
    }
    expect(isTxRelayerProtocolExpectedAtStep(RESIGN_ACK, null)).toBe(false);
  });

  it('does not admit the re-sign acknowledgement on the reporter side', () => {
    for (const step of TX_STEP_SEQUENCES.p2pRelay) {
      expect(isTxProtocolExpectedAtStep(RESIGN_ACK, step)).toBe(false);
    }
  });

  it('keeps a single step per protocol', () => {
    for (const [protocol, step] of Object.entries(TX_RELAYER_PROTOCOL_EXPECTED_STEP)) {
      expect(typeof step, `${protocol} should be a bare step, not a set`).toBe('string');
    }
  });

  it('admits CONNECT at the pairing step and the two sign steps, and nowhere else', () => {
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'acknowledge-sign')).toBe(true);
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'register-sign')).toBe(true);

    for (const step of TX_STEP_SEQUENCES.p2pRelay) {
      if (step === 'wait-for-connection' || step === 'acknowledge-sign' || step === 'register-sign')
        continue;
      expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, step)).toBe(false);
    }
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, null)).toBe(false);
  });
});

/**
 * The re-handshake widening, checked as its own property rather than only through the tables.
 *
 * The defect: `relayerFromPeerSession` is session-only and `step` is persisted, so a reload
 * resumed at a sign step with the signing gate shut and no CONNECT admitted there to reopen it.
 * These pin the exact steps that were opened — on all four tables — so a later edit cannot
 * quietly widen the set to the grace period or to `success`.
 */
describe('CONNECT step sets (re-handshake after reload)', () => {
  it('opens exactly the sign steps, on both sides of both flows', () => {
    expect([...CONNECT_RELAYER_STEPS].sort()).toEqual([
      'acknowledge-and-sign',
      'register-and-sign',
      'wait-for-connection',
    ]);
    expect([...TX_CONNECT_RELAYER_STEPS].sort()).toEqual([
      'acknowledge-sign',
      'register-sign',
      'wait-for-connection',
    ]);
    // The receiver-side tables are the same sets, reached through the table rather than a const.
    expect([...(PROTOCOL_EXPECTED_STEP[PROTOCOLS.CONNECT] ?? [])].sort()).toEqual(
      [...CONNECT_RELAYER_STEPS].sort()
    );
    expect([...(TX_PROTOCOL_EXPECTED_STEP[PROTOCOLS.CONNECT] ?? [])].sort()).toEqual(
      [...TX_CONNECT_RELAYER_STEPS].sort()
    );
  });

  it('never admits CONNECT during the grace period or after success, on any side', () => {
    for (const step of ['grace-period', 'success'] as const) {
      expect(isProtocolExpectedAtStep(PROTOCOLS.CONNECT, step)).toBe(false);
      expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, step)).toBe(false);
      expect(isTxProtocolExpectedAtStep(PROTOCOLS.CONNECT, step)).toBe(false);
      expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, step)).toBe(false);
    }
  });

  it('never admits CONNECT while the reporter is choosing transactions', () => {
    // What gets reported is chosen locally. The relayer's own table admits TX_ACK_SIG there;
    // that is the batch arriving, not a handshake, and the two must not be confused.
    expect(isTxProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'select-transactions')).toBe(false);
    expect(isTxRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'select-transactions')).toBe(false);
  });

  it('keeps every opened step inside its flow sequence', () => {
    for (const step of CONNECT_RELAYER_STEPS) {
      expect(STEP_SEQUENCES.p2pRelay).toContain(step);
    }
    for (const step of TX_CONNECT_RELAYER_STEPS) {
      expect(TX_STEP_SEQUENCES.p2pRelay).toContain(step);
    }
  });
});

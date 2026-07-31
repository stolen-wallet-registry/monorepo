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
} from './protocolSteps';
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

  it('maps every protocol to a step that exists in the p2pRelay sequence', () => {
    // Guards against a typo silently making a protocol permanently inert.
    const sequence = STEP_SEQUENCES.p2pRelay;
    for (const [protocol, step] of Object.entries(PROTOCOL_EXPECTED_STEP)) {
      expect(sequence, `${protocol} maps to a step outside the p2pRelay flow`).toContain(step);
    }
  });

  it('maps each protocol to a distinct step', () => {
    // Two protocols sharing a step would let one stand in for the other.
    const steps = Object.values(PROTOCOL_EXPECTED_STEP);
    expect(new Set(steps).size).toBe(steps.length);
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

  it('maps every protocol to a step that exists in the p2pRelay tx sequence', () => {
    const sequence = TX_STEP_SEQUENCES.p2pRelay;
    for (const [protocol, step] of Object.entries(TX_PROTOCOL_EXPECTED_STEP)) {
      expect(sequence, `${protocol} maps to a step outside the tx p2pRelay flow`).toContain(step);
    }
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

  it('rejects a repeated CONNECT — the relayer-side walk', () => {
    // The relayer advanced on every CONNECT it accepted, so a bound partner could push it
    // into a payment step holding no signature at all. Only the first one counts now.
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'wait-for-connection')).toBe(true);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'acknowledge-and-sign')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'acknowledgement-payment')).toBe(
      false
    );
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'grace-period')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'registration-payment')).toBe(false);
    expect(isRelayerProtocolExpectedAtStep(PROTOCOLS.CONNECT, 'success')).toBe(false);
  });

  it('never lets a message move the relayer out of the grace period or off success', () => {
    for (const protocol of Object.keys(RELAYER_PROTOCOL_EXPECTED_STEP)) {
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

  it('maps every protocol to a step that exists in the p2pRelay tx sequence', () => {
    const sequence = TX_STEP_SEQUENCES.p2pRelay;
    for (const [protocol, step] of Object.entries(TX_RELAYER_PROTOCOL_EXPECTED_STEP)) {
      expect(sequence, `${protocol} maps to a step outside the tx p2pRelay flow`).toContain(step);
    }
  });
});

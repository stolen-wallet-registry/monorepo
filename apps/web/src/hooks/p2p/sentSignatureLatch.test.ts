/**
 * The receipt gate (audit V3, ordering half).
 *
 * `protocolSteps.ts` answers "may this message act at this step". It cannot answer "is this
 * message about anything that exists", and for a payload-free receipt that is the whole
 * question — `ACK_REC` is legitimate at `acknowledge-and-sign`, including in the window before
 * the victim has signed. This latch is the missing correlation.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  clearSentSignature,
  hasSentSignature,
  markSignatureSent,
  receiptMayAdvance,
  resetSentSignatures,
} from './sentSignatureLatch';

beforeEach(() => {
  resetSentSignatures();
});

describe('sentSignatureLatch', () => {
  it('starts closed for every kind', () => {
    expect(receiptMayAdvance('wallet-ack')).toBe(false);
    expect(receiptMayAdvance('wallet-reg')).toBe(false);
    expect(receiptMayAdvance('tx-ack')).toBe(false);
    expect(receiptMayAdvance('tx-reg')).toBe(false);
  });

  it('opens only for the kind that was sent', () => {
    markSignatureSent('wallet-ack');

    expect(receiptMayAdvance('wallet-ack')).toBe(true);
    // The two phases are separately latched: a receipt for the registration must not ride in
    // on the acknowledgement, or the gate collapses back to "any receipt advances".
    expect(receiptMayAdvance('wallet-reg')).toBe(false);
  });

  it('keeps the wallet and transaction flows separate', () => {
    markSignatureSent('tx-ack');

    expect(receiptMayAdvance('tx-ack')).toBe(true);
    expect(receiptMayAdvance('wallet-ack')).toBe(false);
  });

  // A re-sign moves the flow back to a sign step. If the latch survived, the gate would already
  // be open for a signature that has been discarded and not yet replaced.
  it('closes again for a signature that is being re-signed', () => {
    markSignatureSent('wallet-reg');
    clearSentSignature('wallet-reg');

    expect(receiptMayAdvance('wallet-reg')).toBe(false);
  });

  it('clears everything for a flow that starts over', () => {
    markSignatureSent('wallet-ack');
    markSignatureSent('tx-reg');

    resetSentSignatures();

    expect(hasSentSignature('wallet-ack')).toBe(false);
    expect(hasSentSignature('tx-reg')).toBe(false);
  });
});

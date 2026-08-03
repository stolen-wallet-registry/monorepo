/**
 * The pay-step status ladder.
 *
 * These are precedence tests, not enumeration tests: every case here is one where two flags
 * are true at once and the WRONG answer is also a plausible one. That is the whole content of
 * the ladder — the order the branches are written in — and it was previously copied by hand
 * into six pay steps.
 *
 * The second block is a source guard. The six components have no render tests of their own, so
 * nothing else would notice a step that quietly grew its own copy of the ladder back; that
 * silent divergence is the exact failure mode this extraction exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveTransactionStatus } from './transactionStatus';

const NONE = {
  isConfirmed: false,
  isConfirming: false,
  isPending: false,
  isError: false,
};

describe('deriveTransactionStatus', () => {
  it('is idle when nothing is happening', () => {
    expect(deriveTransactionStatus(NONE)).toBe('idle');
  });

  it('reports submitting while the wallet prompt is open', () => {
    expect(deriveTransactionStatus({ ...NONE, isPending: true })).toBe('submitting');
  });

  it('reports pending once the transaction is broadcast', () => {
    expect(deriveTransactionStatus({ ...NONE, isConfirming: true })).toBe('pending');
  });

  it('reports confirmed once the receipt is in', () => {
    expect(deriveTransactionStatus({ ...NONE, isConfirmed: true })).toBe('confirmed');
  });

  it('reports failed when the write hook errored', () => {
    expect(deriveTransactionStatus({ ...NONE, isError: true })).toBe('failed');
  });

  // A confirmed transaction stays confirmed. wagmi's write hook can report `isPending` again
  // from a later interaction while the receipt for the landed transaction is already in, and
  // painting that as "submitting" tells the user their completed registration is still going.
  it('prefers confirmed over every other flag', () => {
    expect(
      deriveTransactionStatus({
        isConfirmed: true,
        isConfirming: true,
        isPending: true,
        isError: true,
        isSubmitting: true,
        localError: 'boom',
      })
    ).toBe('confirmed');
  });

  // The failure branch is LAST on purpose: after a Retry the previous error can still be on
  // the hook while the replacement transaction is in flight, and a red card there would tell
  // the user the retry failed before it had a chance to.
  it('prefers the in-flight state over a stale error', () => {
    expect(deriveTransactionStatus({ ...NONE, isConfirming: true, isError: true })).toBe('pending');
    expect(deriveTransactionStatus({ ...NONE, isPending: true, isError: true })).toBe('submitting');
  });

  // The four non-P2P steps set their own flag for the window before wagmi commits `isPending`.
  it('treats the component own submit flag as submitting', () => {
    expect(deriveTransactionStatus({ ...NONE, isSubmitting: true })).toBe('submitting');
  });

  // ...and their own caught errors, which never reach the write hook at all.
  it('treats a component-local error as failed', () => {
    expect(deriveTransactionStatus({ ...NONE, localError: 'bad params' })).toBe('failed');
  });

  // The P2P steps pass neither. Omitting them must not read as "submitting"/"failed".
  it('defaults the optional flags to inert', () => {
    expect(deriveTransactionStatus(NONE)).toBe('idle');
  });
});

describe('the pay steps all use the shared ladder', () => {
  const PAY_STEPS = [
    'registration/steps/AcknowledgementPayStep.tsx',
    'registration/steps/RegistrationPayStep.tsx',
    'registration/steps/P2PAckPayStep.tsx',
    'registration/steps/P2PRegPayStep.tsx',
    'registration/tx-steps/TxAcknowledgePayStep.tsx',
    'registration/tx-steps/TxRegisterPayStep.tsx',
  ];

  const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const source = (file: string) => readFileSync(join(componentsDir, file), 'utf8');

  it.each(PAY_STEPS)('%s derives its card status from deriveTransactionStatus', (file) => {
    expect(source(file)).toContain('deriveTransactionStatus({');
  });

  // Matches the hand-written ladder's distinctive line. The cross-chain preludes in the two
  // register steps return 'confirmed'/'hub-confirmed' from a `crossChainConfirmation` branch,
  // which is a different decision and deliberately stays local to those components.
  it.each(PAY_STEPS)('%s does not re-declare the local ladder inline', (file) => {
    expect(source(file)).not.toMatch(/if \(isConfirming\) return 'pending';/);
  });
});

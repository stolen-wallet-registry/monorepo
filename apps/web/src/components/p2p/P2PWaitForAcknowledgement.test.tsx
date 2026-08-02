/**
 * Tests for the acknowledgement half of "never advance on the relayer's word" (audit V3).
 *
 * V3 established the rule for REG_PAY, where the registeree page carries a long comment
 * explaining that `data.hash` is shape-checked only — no proof the transaction exists, targets
 * the registry, or succeeded — so the hash is recorded for its explorer link and the flow waits
 * for the chain. Twenty lines above it, ACK_PAY did exactly what that comment forbids: any
 * 66-character hex advanced the victim out of `acknowledgement-payment`.
 *
 * The consequence is specific to the acknowledgement: the victim lands in the anti-phishing
 * grace period with no acknowledgement on chain, waits out the randomised delay, and is then
 * asked to produce a registration signature that cannot succeed — the two-phase flow burned
 * with nothing to show.
 *
 * What is pinned here is the gate itself: an on-chain acknowledgement that is present AND still
 * live is the only thing that advances the flow.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';

import { P2PWaitForAcknowledgement } from './P2PWaitForAcknowledgement';
import { acknowledgementIsOnChain } from '@/hooks/p2p/acknowledgementGate';

/** The contract reports zeroed deadlines as expired, so "no acknowledgement" looks like this. */
const NO_ACK = { start: 0n, expiry: 0n, isExpired: true };
const LIVE_ACK = { start: 100n, expiry: 200n, isExpired: false };
const STALE_ACK = { start: 100n, expiry: 200n, isExpired: true };

describe('acknowledgementIsOnChain', () => {
  it('is false while the read has not landed', () => {
    expect(acknowledgementIsOnChain(undefined)).toBe(false);
  });

  it('is false when there is no pending acknowledgement', () => {
    expect(acknowledgementIsOnChain(NO_ACK)).toBe(false);
  });

  // A leftover acknowledgement from an abandoned attempt is still readable on chain. Advancing
  // on it would drop the victim into a grace period whose window has already shut.
  it('is false for an acknowledgement whose window has already closed', () => {
    expect(acknowledgementIsOnChain(STALE_ACK)).toBe(false);
  });

  it('is true only for a live acknowledgement', () => {
    expect(acknowledgementIsOnChain(LIVE_ACK)).toBe(true);
  });
});

describe('P2PWaitForAcknowledgement', () => {
  it('does not advance on a relayer-reported hash alone', async () => {
    const onComplete = vi.fn();
    render(
      <P2PWaitForAcknowledgement
        deadlines={NO_ACK}
        onComplete={onComplete}
        waitingFor="acknowledgement transaction"
      />
    );

    expect(
      await screen.findByText(/confirmed on chain, not when they say it is/i)
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('advances once the chain shows a live acknowledgement', async () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <P2PWaitForAcknowledgement
        deadlines={NO_ACK}
        onComplete={onComplete}
        waitingFor="acknowledgement transaction"
      />
    );
    expect(onComplete).not.toHaveBeenCalled();

    rerender(
      <P2PWaitForAcknowledgement
        deadlines={LIVE_ACK}
        onComplete={onComplete}
        waitingFor="acknowledgement transaction"
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  // The deadlines hook polls, so this component re-renders with a confirmed acknowledgement
  // many times. Advancing twice would skip a step of the two-phase flow.
  it('advances exactly once across repeated confirmations', async () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <P2PWaitForAcknowledgement
        deadlines={LIVE_ACK}
        onComplete={onComplete}
        waitingFor="acknowledgement transaction"
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    for (const timeLeft of [90n, 80n, 70n]) {
      rerender(
        <P2PWaitForAcknowledgement
          deadlines={{ ...LIVE_ACK, expiry: LIVE_ACK.expiry + timeLeft }}
          onComplete={onComplete}
          waitingFor="acknowledgement transaction"
        />
      );
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

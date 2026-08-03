/**
 * The single UI gate between a relayer and a hostile signature.
 *
 * `reviewRelayedSignature` decides what the issues ARE; these tests are about whether a relayer
 * about to spend gas is actually shown them. The load-bearing assertions are therefore: every
 * issue produces visible, actionable text; a failing review never renders the reassuring
 * "verified" line; and both addresses are rendered as raw hex so the comparison the relayer is
 * being asked to make is a comparison of facts.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';

import type { RelaySignatureReview } from '@/lib/signatures/relayVerification';
import type { Address } from '@/lib/types/ethereum';
import { RelayedSignatureReview } from './RelayedSignatureReview';

const PAIRED_WALLET = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0' as Address;
const IMPOSTOR = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address;

const FUTURE_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);
const PAST_DEADLINE = BigInt(Math.floor(Date.now() / 1000) - 60);

// ENS is deliberately off on this surface (audit V26), but EnsExplorerLink still calls the hook.
vi.mock('@/hooks/ens', () => ({
  useEnsDisplay: () => ({ name: null, avatar: null, isLoading: false }),
}));

function review(
  issues: RelaySignatureReview['issues'],
  recoveredSigner: Address | null = PAIRED_WALLET
): RelaySignatureReview {
  return { recoveredSigner, issues, ok: issues.length === 0 };
}

function renderReview(overrides: Partial<Parameters<typeof RelayedSignatureReview>[0]> = {}) {
  return render(
    <RelayedSignatureReview
      review={review([])}
      isChecking={false}
      expectedSigner={PAIRED_WALLET}
      deadline={FUTURE_DEADLINE}
      {...overrides}
    />
  );
}

describe('RelayedSignatureReview — nothing to review yet', () => {
  /**
   * A null review means the verifier has not produced a verdict. Rendering the detail panel
   * with empty fields would read as "checked, nothing wrong" — the one thing it must never say.
   */
  it('claims nothing before a verdict exists', () => {
    renderReview({ review: null, isChecking: true });

    expect(screen.getByText(/verifying the signature/i)).toBeInTheDocument();
    expect(screen.queryByTestId('relayed-signature-review')).not.toBeInTheDocument();
    expect(screen.queryByText(/signature verified/i)).not.toBeInTheDocument();
  });
});

describe('RelayedSignatureReview — clean signature', () => {
  it('states all three things it checked', () => {
    renderReview();

    expect(screen.getByText(/signature verified/i)).toBeInTheDocument();
    // Twice: the nonce badge and the summary sentence both say it.
    expect(screen.getAllByText(/matches the contract/i).length).toBeGreaterThan(0);
  });
});

describe('RelayedSignatureReview — each blocking issue', () => {
  /**
   * The attack the panel exists for: valid ECDSA from a key that is not the paired wallet.
   * Paying registers someone else's wallet at the relayer's expense, so the guidance has to be
   * an instruction not to pay, not a neutral status line.
   */
  it('tells the relayer not to pay on a signer mismatch', () => {
    renderReview({ review: review(['signer-mismatch'], IMPOSTOR) });

    expect(screen.getByText(/not produced by the wallet named in the pairing code/i)).toBeVisible();
    expect(screen.getByText(/do not pay for this transaction/i)).toBeVisible();
    expect(screen.queryByText(/signature verified/i)).not.toBeInTheDocument();
  });

  /**
   * No pairing code means there is no out-of-band statement to check against. Falling back to
   * the peer's own claim is the exact hole this check closes, so this fails closed and gets its
   * own remedy rather than being reported as a mismatch.
   */
  it('explains an unknown pairing without accusing anyone', () => {
    renderReview({ review: review(['pairing-unknown']), expectedSigner: null });

    expect(screen.getByText(/no pairing code/i)).toBeVisible();
    expect(screen.getByText(/unknown/i)).toBeVisible();
    expect(screen.queryByText(/do not pay/i)).not.toBeInTheDocument();
  });

  it('reports a nonce the contract has moved past', () => {
    renderReview({ review: review(['nonce-mismatch']) });

    expect(screen.getByText(/does not match the contract/i)).toBeVisible();
    expect(screen.getByText(/ask your partner to sign again/i)).toBeVisible();
  });

  /** Still a block, but a pending read rather than a fault — the wording must not accuse. */
  it('blocks while the nonce read is outstanding', () => {
    renderReview({ review: review(['nonce-unknown']), isChecking: true });

    expect(screen.getByText(/still reading the current nonce/i)).toBeVisible();
    expect(screen.getByText(/payment is blocked/i)).toBeVisible();
    expect(screen.queryByText(/signature verified/i)).not.toBeInTheDocument();
  });

  it('reports an expired deadline and shows the countdown as expired', () => {
    renderReview({ review: review(['deadline-expired']), deadline: PAST_DEADLINE });

    expect(screen.getByText(/the signature has expired/i)).toBeVisible();
    expect(screen.getByText('expired')).toBeInTheDocument();
  });

  it('reports a signature whose digest could not be recovered', () => {
    renderReview({ review: review(['recovery-failed'], null) });

    expect(screen.getByText(/could not be recovered/i)).toBeVisible();
    expect(screen.getByText(/could not be verified/i)).toBeVisible();
  });

  /**
   * Registration only. `blockhash(windowBlock)` is recomputable for 256 blocks; past that the
   * contract reverts AFTER the relayer's gas is spent. It is the only invalidating condition
   * knowable client-side without an extra chain read, which is why it is worth surfacing here.
   */
  it('reports a stale window block', () => {
    renderReview({ review: review(['window-block-stale']) });

    expect(screen.getByText(/gone stale/i)).toBeVisible();
    expect(screen.getByText(/ask for a new signature before paying/i)).toBeVisible();
  });

  /** A hostile signature is not obliged to have exactly one thing wrong with it. */
  it('lists every issue rather than only the first', () => {
    renderReview({
      review: review(['signer-mismatch', 'nonce-mismatch', 'deadline-expired'], IMPOSTOR),
      deadline: PAST_DEADLINE,
    });

    expect(screen.getByText(/do not pay for this transaction/i)).toBeVisible();
    expect(screen.getByText(/nonce the contract has already moved past/i)).toBeVisible();
    expect(screen.getByText(/the signature has expired/i)).toBeVisible();
  });
});

describe('RelayedSignatureReview — address rendering (audit V26)', () => {
  /**
   * Both addresses render as raw hex. An all-ASCII ENS name can impersonate a hex address, and
   * this is exactly the surface where the user compares two addresses to make a trust decision:
   * a name is a claim, the hex is the fact. Adding ENS resolution here re-opens V26.
   */
  it('shows the recovered signer and the expected signer as hex', () => {
    renderReview({ review: review(['signer-mismatch'], IMPOSTOR) });

    expect(screen.getByText(/signed by:/i)).toBeInTheDocument();
    expect(screen.getByText(/you were told:/i)).toBeInTheDocument();
    // ExplorerLink renders both a truncated label and a full-value node, hence getAllByText.
    // What matters is that the hex is present at all, and that no ENS name stands in for it.
    expect(screen.getAllByText(/0x9fE4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0x742D/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\.eth/)).not.toBeInTheDocument();
  });
});

describe('RelayedSignatureReview — acknowledgement signatures', () => {
  /** Acknowledgements carry no freshness commitment, so there is no deadline row to show. */
  it('omits the expiry row when there is no deadline', () => {
    renderReview({ deadline: undefined });

    expect(screen.queryByText(/expires:/i)).not.toBeInTheDocument();
  });
});

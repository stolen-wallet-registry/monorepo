/**
 * This panel is the single UI gate between a relayer and a hostile signature: it is where a
 * relayer decides whether to spend its own gas on something a peer sent it. Every issue the
 * verifier can report gets a story, because "what does a relayer actually see when this goes
 * wrong" is not answerable from the reducer's unit tests.
 *
 * Addresses are rendered as raw hex on purpose (`resolveEns={false}`) — audit finding V26. An
 * all-ASCII ENS name can impersonate a hex address, and this is precisely the surface where the
 * user is comparing two addresses to make a trust decision.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { RelayedSignatureReview } from './RelayedSignatureReview';
import type { RelaySignatureReview } from '@/lib/signatures/relayVerification';

const PAIRED_WALLET = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';
const IMPOSTOR = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

/** Far enough out that the countdown reads in hours and does not churn between snapshots. */
const DEADLINE_HEALTHY = BigInt(Math.floor(Date.now() / 1000) + 3 * 3600);
const DEADLINE_SOON = BigInt(Math.floor(Date.now() / 1000) + 45);
const DEADLINE_PAST = BigInt(Math.floor(Date.now() / 1000) - 60);

function review(
  issues: RelaySignatureReview['issues'],
  recoveredSigner: string | null = PAIRED_WALLET
): RelaySignatureReview {
  return {
    recoveredSigner: recoveredSigner as RelaySignatureReview['recoveredSigner'],
    issues,
    ok: issues.length === 0,
  };
}

const meta: Meta<typeof RelayedSignatureReview> = {
  title: 'Composed/RelayedSignatureReview',
  component: RelayedSignatureReview,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    deadline: { control: false },
    review: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-[32rem]">
        <Story />
      </div>
    ),
  ],
  args: {
    isChecking: false,
    expectedSigner: PAIRED_WALLET as `0x${string}`,
    deadline: DEADLINE_HEALTHY,
  },
};

export default meta;
type Story = StoryObj<typeof RelayedSignatureReview>;

/** Safe to pay for: right signer, live nonce, unexpired. */
export const Verified: Story = {
  args: { review: review([]) },
};

/**
 * Before the verifier has produced anything. There is nothing to show and nothing to claim,
 * so the panel says only that it is working.
 */
export const NotYetReviewed: Story = {
  args: { review: null, isChecking: true },
};

/**
 * The nonce read is still outstanding. Not an accusation — but payment stays blocked, because
 * the entire point is to check against the chain rather than trust the payload.
 */
export const NonceUnknown: Story = {
  args: { review: review(['nonce-unknown']), isChecking: true },
};

/** The contract has moved past this nonce; the signature can only revert now. */
export const NonceMismatch: Story = {
  args: { review: review(['nonce-mismatch']) },
};

/**
 * The attack this panel exists for. Valid ECDSA, but produced by a different key than the
 * wallet in the pairing code — paying registers someone else's wallet at the relayer's expense.
 */
export const SignerMismatch: Story = {
  args: { review: review(['signer-mismatch'], IMPOSTOR) },
};

/**
 * No pairing code in this session, so there is no out-of-band statement to check the recovered
 * signer against. Fails closed and is reported separately from a mismatch: it is not an
 * accusation, and its remedy is different.
 */
export const PairingUnknown: Story = {
  args: { review: review(['pairing-unknown']), expectedSigner: null },
};

/** The digest could not be recovered at all. */
export const RecoveryFailed: Story = {
  args: { review: review(['recovery-failed'], null) },
};

/** Deadline in the past. The countdown reads "expired" and the issue is stated outright. */
export const DeadlineExpired: Story = {
  args: { review: review(['deadline-expired']), deadline: DEADLINE_PAST },
};

/** Still valid, but the relayer has under a minute to decide. */
export const ExpiringSoon: Story = {
  args: { review: review([]), deadline: DEADLINE_SOON },
};

/**
 * Registration only. The signature commits to `blockhash(windowBlock)`, which the contract can
 * only recompute for the last 256 blocks — past that it reverts AFTER the relayer's gas is
 * spent. This is the one issue knowable client-side without an extra chain read.
 */
export const WindowBlockStale: Story = {
  args: { review: review(['window-block-stale']) },
};

/** Nothing says a hostile signature has only one thing wrong with it. */
export const MultipleIssues: Story = {
  args: {
    review: review(['signer-mismatch', 'nonce-mismatch', 'deadline-expired'], IMPOSTOR),
    deadline: DEADLINE_PAST,
  },
};

/** Acknowledgement signatures carry no deadline row at all. */
export const NoDeadlineRow: Story = {
  args: { review: review([]), deadline: undefined },
};

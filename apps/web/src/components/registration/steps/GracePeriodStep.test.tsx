/**
 * Recovery from the two terminal grace-period states.
 *
 * These are the states audit finding UI-4 is about. A user whose on-chain registration window
 * closes during the grace period has already PAID for an acknowledgement, and the step used to
 * render "Please go back and submit the acknowledgement again" with no back control anywhere in
 * the flow — `StepIndicator` is not interactive and `goToPreviousStep` was only ever called
 * automatically inside a pay step's retry. The only button on screen was "Back to Home", which
 * resets everything. The instruction named an action the UI could not perform.
 *
 * So these tests are about the control existing and doing the right thing, not about copy: the
 * button must be present, it must return the user to the acknowledgement signing step, and it
 * must discard both cached signatures — the acknowledgement's nonce is spent, so a retained
 * signature for either phase can only produce another revert.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { SIGNATURE_STEP } from '@swr/signatures';

import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { storeSignature, getSignature } from '@/lib/signatures';
import type { Address, Hex } from '@/lib/types/ethereum';
import { GracePeriodStep } from './GracePeriodStep';

const REGISTEREE = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0' as Address;
const FORWARDER = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address;
const CHAIN_ID = 31337;

/** Deadline shape returned by `useContractDeadlines`, swapped per test. */
let deadlines: {
  start: bigint;
  expiry: bigint;
  currentBlock: bigint;
  isExpired: boolean;
} | null = null;

vi.mock('@/hooks/useContractDeadlines', () => ({
  useContractDeadlines: () => ({
    data: deadlines ?? undefined,
    isLoading: false,
    isError: false,
  }),
}));

// The step switches the app to the "hacker" theme when the timer expires; none of that is
// under test and the provider is not mounted by `test-utils`.
vi.mock('@/providers/useTheme', () => ({
  useTheme: () => ({
    themeVariant: 'default',
    triggerThemeAnimation: undefined,
    setThemeVariant: vi.fn(),
    setColorScheme: vi.fn(),
  }),
}));

function seedSignatures() {
  for (const step of [SIGNATURE_STEP.ACKNOWLEDGEMENT, SIGNATURE_STEP.REGISTRATION]) {
    storeSignature({
      signature: `0x${'ab'.repeat(65)}` as Hex,
      deadline: 1_800_000_000n,
      nonce: 0n,
      address: REGISTEREE,
      chainId: CHAIN_ID,
      step,
      storedAt: Date.now(),
      trustedForwarder: FORWARDER,
    });
  }
}

beforeEach(() => {
  sessionStorage.clear();
  deadlines = null;
  useFormStore.setState({ registeree: REGISTEREE, relayer: FORWARDER });
  useRegistrationStore.setState({ registrationType: 'standard', step: 'grace-period' });
});

describe('GracePeriodStep — window closed on-chain', () => {
  beforeEach(() => {
    // A real acknowledgement (non-zero deadlines) whose expiry block has passed.
    deadlines = { start: 100n, expiry: 200n, currentBlock: 250n, isExpired: true };
  });

  it('offers a recovery control instead of instructing navigation that does not exist', () => {
    render(<GracePeriodStep onComplete={vi.fn()} />);

    expect(screen.getByText(/registration window has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    // The old copy pointed at a back control the flow has never had.
    expect(screen.queryByText(/please go back/i)).not.toBeInTheDocument();
  });

  it('returns the user to the acknowledgement signing step', async () => {
    render(<GracePeriodStep onComplete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    await waitFor(() => {
      expect(useRegistrationStore.getState().step).toBe('acknowledge-and-sign');
    });
  });

  /**
   * The acknowledgement's nonce is spent once its window closes, so both cached signatures are
   * dead. Keeping either means the user signs nothing new and the next submit reverts with the
   * same opaque error — the exact loop the recovery exists to break.
   */
  it('discards both cached signatures', async () => {
    seedSignatures();
    expect(getSignature(REGISTEREE, CHAIN_ID, SIGNATURE_STEP.ACKNOWLEDGEMENT)).not.toBeNull();

    render(<GracePeriodStep onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    await waitFor(() => {
      expect(getSignature(REGISTEREE, CHAIN_ID, SIGNATURE_STEP.ACKNOWLEDGEMENT)).toBeNull();
      expect(getSignature(REGISTEREE, CHAIN_ID, SIGNATURE_STEP.REGISTRATION)).toBeNull();
    });
  });

  /**
   * The window is closed, so the grace-period countdown must not run. Advancing would walk the
   * user through a second wallet signature into a guaranteed revert.
   */
  it('does not complete the step', async () => {
    const onComplete = vi.fn();
    render(<GracePeriodStep onComplete={onComplete} />);

    await userEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('GracePeriodStep — no pending acknowledgement', () => {
  // Zeroed deadlines: the contract holds no acknowledgement for this registeree at all.
  beforeEach(() => {
    deadlines = { start: 0n, expiry: 0n, currentBlock: 250n, isExpired: true };
  });

  it('offers the same recovery control', async () => {
    render(<GracePeriodStep onComplete={vi.fn()} />);

    expect(screen.getByText(/no pending acknowledgement/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    await waitFor(() => {
      expect(useRegistrationStore.getState().step).toBe('acknowledge-and-sign');
    });
  });
});

describe('GracePeriodStep — missing registeree', () => {
  it('offers a full restart rather than a step-back', async () => {
    useFormStore.setState({ registeree: null });
    render(<GracePeriodStep onComplete={vi.fn()} />);

    expect(screen.getByText(/missing registration data/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /start over/i }));

    // A full reset: there is no registeree to return to a signing step with.
    await waitFor(() => {
      expect(useRegistrationStore.getState().step).toBeNull();
      expect(useFormStore.getState().registeree).toBeNull();
    });
  });
});

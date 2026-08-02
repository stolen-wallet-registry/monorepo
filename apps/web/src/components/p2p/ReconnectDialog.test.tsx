/**
 * Tests for the reconnect path's half of the pairing binding (audit V4, residual gap).
 *
 * V4 bound the gas-paying helper to ONE wallet by making it paste a pairing token before it
 * dials, and recording that wallet "before any wire data exists". The reconnect path was never
 * reviewed against it: it accepted a bare peer ID behind a `startsWith('12D3KooW')` check and
 * handed it straight to `onReconnected`, which every page turns into `setPartnerPeerId` +
 * `setConnectedToPeer(true)`. Circuit-relay connections drop routinely, so this dialog opens in
 * normal operation — a socially-engineered "my peer ID changed" re-pinned the partner to an
 * arbitrary peer with no pairing artifact involved at all.
 *
 * What is pinned here is the refusal, on both sides of the flow:
 *   - the helper (has a `pairedWallet`) may re-pin only via a fresh pairing code naming THAT
 *     SAME wallet — a new peer ID is the point, a new wallet is the attack;
 *   - the party being helped (no `pairedWallet`) has no artifact to check a peer ID against,
 *     so it gets no typed-identity path at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/test-utils';

import { ReconnectDialog } from './ReconnectDialog';
import type { Address } from '@/lib/types/ethereum';

const reconnectToPeer = vi.fn();
const processMessageQueue = vi.fn();

vi.mock('@/lib/p2p/reconnect', () => ({
  reconnectToPeer: (...args: unknown[]) => reconnectToPeer(...args),
}));

vi.mock('@/lib/p2p/messageQueue', () => ({
  processMessageQueue: (...args: unknown[]) => processMessageQueue(...args),
}));

const OLD_PEER_ID = '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN';
const NEW_PEER_ID = '12D3KooWJRSrypvnpHgc6ZAgyCni4KcSmbV7uGRaMw5LgMKT18fq';
const PAIRED_WALLET = '0x1111111111111111111111111111111111111111' as Address;
const OTHER_WALLET = '0x2222222222222222222222222222222222222222' as Address;

/** libp2p is only forwarded to the mocked reconnect helper, so any non-null value will do. */
const getLibp2p = () => ({}) as never;

interface RenderOptions {
  pairedWallet?: Address | null;
  onClearPairing?: () => void;
}

function renderDialog({ pairedWallet = PAIRED_WALLET, onClearPairing }: RenderOptions = {}) {
  const onReconnected = vi.fn();
  render(
    <ReconnectDialog
      open
      onOpenChange={vi.fn()}
      getLibp2p={getLibp2p}
      currentPeerId={OLD_PEER_ID}
      partnerRole="registeree"
      pairedWallet={pairedWallet}
      onClearPairing={onClearPairing}
      onReconnected={onReconnected}
    />
  );
  return { onReconnected };
}

/**
 * Switch to the "connect to a different peer" mode and submit `value`.
 *
 * Pastes rather than types: a pairing code is ~100 characters, and `userEvent.type` dispatches
 * an event per character, which made these tests take seconds each and flake on timeout under
 * full-suite load. Pasting is also what a user actually does with a code they were sent.
 */
async function submitNewPairing(value: string) {
  await userEvent.click(screen.getByRole('button', { name: /new pairing code/i }));
  const input = screen.getByLabelText(/pairing code/i);
  await userEvent.click(input);
  await userEvent.paste(value);
  await userEvent.click(screen.getByRole('button', { name: /^connect$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  reconnectToPeer.mockResolvedValue({ connection: {}, result: { success: true } });
  processMessageQueue.mockResolvedValue({ processed: 0, failed: 0 });
});

describe('ReconnectDialog — re-pinning a partner', () => {
  it('refuses a bare peer ID and explains what to ask for instead', async () => {
    const { onReconnected } = renderDialog();

    await submitNewPairing(NEW_PEER_ID);

    expect(reconnectToPeer).not.toHaveBeenCalled();
    expect(onReconnected).not.toHaveBeenCalled();
    expect(await screen.findByText(/full pairing code/i)).toBeInTheDocument();
  });

  // The core of the finding: a valid pairing code is not enough, it has to name the wallet
  // this session already agreed to pay for. Otherwise the reconnect path is a second, unguarded
  // way to change which wallet the helper is bound to.
  it('refuses a well-formed pairing code that names a different wallet', async () => {
    const { onReconnected } = renderDialog();

    await submitNewPairing(`swr1:${NEW_PEER_ID}:${OTHER_WALLET}`);

    expect(reconnectToPeer).not.toHaveBeenCalled();
    expect(onReconnected).not.toHaveBeenCalled();
    expect(await screen.findByText(/different wallet/i)).toBeInTheDocument();
  });

  it('accepts a fresh pairing code for the same wallet on a new peer ID', async () => {
    const { onReconnected } = renderDialog();

    await submitNewPairing(`swr1:${NEW_PEER_ID}:${PAIRED_WALLET}`);

    await waitFor(() => expect(onReconnected).toHaveBeenCalledWith(NEW_PEER_ID));
    expect(reconnectToPeer).toHaveBeenCalledWith(expect.anything(), NEW_PEER_ID);
  });

  // Address comparison must not be casing-sensitive: pairing codes are copied from a UI that
  // may render either checksummed or lowercased, and refusing on case alone would push users
  // toward the "just restart everything" path for no security gain.
  it('matches the paired wallet case-insensitively', async () => {
    const { onReconnected } = renderDialog();

    await submitNewPairing(
      `swr1:${NEW_PEER_ID}:${PAIRED_WALLET.toUpperCase().replace('0X', '0x')}`
    );

    await waitFor(() => expect(onReconnected).toHaveBeenCalledWith(NEW_PEER_ID));
  });

  it('does not re-pin when the dial itself fails', async () => {
    reconnectToPeer.mockResolvedValue({ connection: null, result: { success: false } });
    const { onReconnected } = renderDialog();

    await submitNewPairing(`swr1:${NEW_PEER_ID}:${PAIRED_WALLET}`);

    await waitFor(() => expect(reconnectToPeer).toHaveBeenCalled());
    expect(onReconnected).not.toHaveBeenCalled();
  });
});

describe('ReconnectDialog — the party being helped has no pairing artifact', () => {
  // The registeree/reporter publishes a pairing code, it never holds one for its partner. So
  // there is nothing a typed peer ID could be checked against, and offering the input at all
  // would be offering an unauthenticated re-pin dressed up as a security control.
  it('offers no pairing-code input when there is no paired wallet', async () => {
    renderDialog({ pairedWallet: null });

    await userEvent.click(screen.getByRole('button', { name: /new pairing code/i }));

    expect(screen.queryByLabelText(/pairing code/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no pairing code to check/i)).toBeInTheDocument();
  });

  it('offers to clear the pairing so the partner can dial in again', async () => {
    const onClearPairing = vi.fn();
    renderDialog({ pairedWallet: null, onClearPairing });

    await userEvent.click(screen.getByRole('button', { name: /new pairing code/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear the pairing/i }));

    expect(onClearPairing).toHaveBeenCalled();
  });
});

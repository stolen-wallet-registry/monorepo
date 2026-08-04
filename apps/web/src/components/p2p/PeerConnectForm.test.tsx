/**
 * Tests for the paste side of the pairing code (audit V4).
 *
 * This form is where the relayer's out-of-band knowledge of the wallet enters the app. The
 * behaviour worth pinning is the refusal: a bare peer ID — the artifact people exchanged
 * before the pairing code existed, and the one an attacker would happily supply — must not
 * connect, because a pairing with no wallet in it silently restores the unauthorized-wallet
 * path the code exists to close. It must also say WHY, or a user will conclude the app is
 * broken and look for a way around it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/test-utils';

import { PeerConnectForm } from './PeerConnectForm';

const PEER_ID = '12D3KooWDpJ7As7BWAwRMfu1VU2WCqNjvq387JEYKDBj4kx6nXTN';
const ADDRESS = '0x1111111111111111111111111111111111111111';

async function submit(value: string) {
  const onConnect = vi.fn(async () => {});
  render(<PeerConnectForm onConnect={onConnect} />);

  await userEvent.type(screen.getByLabelText(/pairing code/i), value);
  await userEvent.click(screen.getByRole('button', { name: /connect/i }));

  return onConnect;
}

describe('PeerConnectForm', () => {
  it('connects with a well-formed pairing code, passing it through unparsed', async () => {
    const token = `swr1:${PEER_ID}:${ADDRESS}`;
    const onConnect = await submit(token);

    expect(onConnect).toHaveBeenCalledWith(token);
  });

  it('refuses a bare legacy Peer ID and explains what to ask for instead', async () => {
    const onConnect = await submit(PEER_ID);

    expect(onConnect).not.toHaveBeenCalled();
    expect(await screen.findByText(/full pairing code/i)).toBeInTheDocument();
    expect(screen.getByText(/swr1:/)).toBeInTheDocument();
  });

  it('refuses a pairing code whose wallet address is not an address', async () => {
    const onConnect = await submit(`swr1:${PEER_ID}:0xnope`);

    expect(onConnect).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/wallet address inside that pairing code is not valid/i)
    ).toBeInTheDocument();
  });

  it('refuses a pairing code whose peer ID is not a peer ID', async () => {
    const onConnect = await submit(`swr1:not-a-peer-id:${ADDRESS}`);

    expect(onConnect).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Peer ID inside that pairing code is not valid/i)
    ).toBeInTheDocument();
  });
});

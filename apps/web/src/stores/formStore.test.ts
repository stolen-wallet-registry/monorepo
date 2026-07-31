/**
 * Tests for form state rehydration and relayer provenance.
 *
 * In the P2P flow `relayer` becomes the `trustedForwarder` inside the signed message, and
 * whoever holds that role can complete the irreversible registration on their own schedule.
 * It normally arrives from the peer's CONNECT payload — but a reload at `acknowledge-and-sign`
 * does not re-run CONNECT, so without a provenance marker the value that gets signed is
 * whatever sits in localStorage. `relayerFromPeerSession` is that marker, and it is only
 * meaningful if it can never survive a reload.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useFormStore } from './formStore';

const STORAGE_KEY = 'swr-form-state';

// Both must be EIP-55 checksummed: this store validates with viem's `isAddress`, which
// enforces the checksum by default and would otherwise drop them on rehydrate.
const RELAYER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ATTACKER = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

async function rehydrateWith(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }));
  await useFormStore.persist.rehydrate();
  return useFormStore.getState();
}

beforeEach(() => {
  localStorage.clear();
  useFormStore.getState().reset();
});

describe('formStore relayer provenance (V28)', () => {
  it('marks the relayer as handshaked only via setRelayerFromPeer', () => {
    useFormStore.getState().setRelayerFromPeer(RELAYER);

    const state = useFormStore.getState();
    expect(state.relayer).toBe(RELAYER);
    expect(state.relayerFromPeerSession).toBe(true);
  });

  it('does not confer provenance through the plain form setter', () => {
    useFormStore.getState().setRelayer(RELAYER);

    expect(useFormStore.getState().relayerFromPeerSession).toBe(false);
  });

  it('clears provenance when the relayer is overwritten by a batch form write', () => {
    useFormStore.getState().setRelayerFromPeer(RELAYER);
    useFormStore.getState().setFormValues({ relayer: ATTACKER });

    const state = useFormStore.getState();
    expect(state.relayer).toBe(ATTACKER);
    expect(state.relayerFromPeerSession).toBe(false);
  });

  it('leaves provenance intact when a batch write does not touch the relayer', () => {
    useFormStore.getState().setRelayerFromPeer(RELAYER);
    useFormStore.getState().setFormValues({ registeree: ATTACKER });

    expect(useFormStore.getState().relayerFromPeerSession).toBe(true);
  });

  it('never persists the provenance flag', () => {
    useFormStore.getState().setRelayerFromPeer(RELAYER);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state).not.toHaveProperty('relayerFromPeerSession');
  });

  it('restores a persisted relayer WITHOUT provenance', async () => {
    // The attack: write an attacker address into localStorage and force a reload. The value
    // comes back, but unmarked — and the signing path refuses an unmarked relayer.
    const state = await rehydrateWith({ registeree: RELAYER, relayer: ATTACKER });

    expect(state.relayer).toBe(ATTACKER);
    expect(state.relayerFromPeerSession).toBe(false);
  });

  it('ignores a provenance flag injected into the persisted blob', async () => {
    // Persisting the flag would hand the attacker the very thing it withholds, so the merge
    // sets it explicitly rather than trusting what was stored.
    const state = await rehydrateWith({
      relayer: ATTACKER,
      relayerFromPeerSession: true,
    });

    expect(state.relayerFromPeerSession).toBe(false);
  });

  it('drops malformed addresses on rehydrate', async () => {
    const state = await rehydrateWith({ registeree: 'nope', relayer: '0x1234' });

    expect(state.registeree).toBeNull();
    expect(state.relayer).toBeNull();
  });

  it('clears provenance on reset', () => {
    useFormStore.getState().setRelayerFromPeer(RELAYER);
    useFormStore.getState().reset();

    expect(useFormStore.getState().relayerFromPeerSession).toBe(false);
  });
});

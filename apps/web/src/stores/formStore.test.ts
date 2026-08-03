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
import {
  needsRehandshake,
  matchesPairedRelayer,
  REHANDSHAKE_WALLET_STEPS,
} from '@/lib/p2p/rehandshake';

const STORAGE_KEY = 'swr-form-state';

/** Stands in for a pinned partner peer ID; only its presence matters here. */
const PARTNER = '12D3KooWTestPartnerPeerId';

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

/**
 * The other half of the same property: the gate has to be escapable.
 *
 * Holding `relayerFromPeerSession` false across a reload is correct, but until the
 * re-handshake landed there was no way to earn it back — the flag was only ever set by a
 * CONNECT, CONNECT was only admitted at `wait-for-connection`, and it was only ever SENT from
 * `WaitForConnectionStep`, which no side renders at a sign step. So a reload mid-flow meant
 * signing refused forever, with error copy pointing at a recovery that did not exist.
 *
 * These walk the real store through the real lifecycle and check both directions at once:
 * a reload leaves the gate shut, and only a live partner's answer opens it.
 */
describe('formStore provenance across a mid-flow reload', () => {
  it('shuts the signing gate on reload and reopens it only on a live answer', async () => {
    // 1. A genuine handshake this session.
    useFormStore.getState().setRelayerFromPeer(RELAYER);
    expect(
      needsRehandshake({
        step: 'acknowledge-and-sign',
        partnerPeerId: PARTNER,
        provenanceOk: useFormStore.getState().relayerFromPeerSession,
        rehandshakeSteps: REHANDSHAKE_WALLET_STEPS,
      }),
      'a live session must not dial anybody'
    ).toBe(false);

    // 2. Reload. `step` is persisted by the registration store, so the flow resumes at the
    //    sign step; `relayer` comes back, the mark does not.
    const reloaded = await rehydrateWith({ registeree: RELAYER, relayer: RELAYER });
    expect(reloaded.relayer).toBe(RELAYER);
    expect(reloaded.relayerFromPeerSession).toBe(false);

    // 3. That is the dead end — and it is now detected rather than permanent.
    expect(
      needsRehandshake({
        step: 'acknowledge-and-sign',
        partnerPeerId: PARTNER,
        provenanceOk: reloaded.relayerFromPeerSession,
        rehandshakeSteps: REHANDSHAKE_WALLET_STEPS,
      })
    ).toBe(true);

    // 4. The pinned partner answers, naming the same relayer already on file.
    expect(matchesPairedRelayer(false, RELAYER, useFormStore.getState().relayer)).toBe(true);
    useFormStore.getState().setRelayerFromPeer(RELAYER);

    // 5. Signing is unblocked, and nothing dials again.
    expect(useFormStore.getState().relayerFromPeerSession).toBe(true);
    expect(
      needsRehandshake({
        step: 'acknowledge-and-sign',
        partnerPeerId: PARTNER,
        provenanceOk: useFormStore.getState().relayerFromPeerSession,
        rehandshakeSteps: REHANDSHAKE_WALLET_STEPS,
      })
    ).toBe(false);
  });

  it('a persisted relayer alone never reopens the gate, however many times it rehydrates', async () => {
    // The attack the flag exists for: write an address into localStorage and force reloads.
    // Rehydration is not evidence, and repeating it is not evidence either — only an inbound
    // CONNECT from the pinned peer calls `setRelayerFromPeer`, and nothing here does.
    for (let i = 0; i < 3; i++) {
      const state = await rehydrateWith({
        relayer: ATTACKER,
        // Injected directly, as an attacker with profile write access would.
        relayerFromPeerSession: true,
      });
      expect(state.relayer).toBe(ATTACKER);
      expect(state.relayerFromPeerSession).toBe(false);
      expect(
        needsRehandshake({
          step: 'register-and-sign',
          partnerPeerId: PARTNER,
          provenanceOk: state.relayerFromPeerSession,
          rehandshakeSteps: REHANDSHAKE_WALLET_STEPS,
        }),
        'the gate must still be shut'
      ).toBe(true);
    }
  });

  it('refuses an answer that names a relayer other than the one on file', async () => {
    // The re-handshake must not become a second way to change the forwarder. The
    // acknowledgement already on chain names the original, so a partner reporting a different
    // one is refused rather than believed — the address is never adopted on this path.
    await rehydrateWith({ relayer: RELAYER });

    expect(matchesPairedRelayer(false, ATTACKER, useFormStore.getState().relayer)).toBe(false);
    expect(useFormStore.getState().relayerFromPeerSession).toBe(false);
  });

  it('does not attempt a reconnect when nothing is pinned to reconnect to', async () => {
    // No partner means no authenticated peer to ask, so this is a genuine restart. Retrying
    // would spin against a peer that could not be accepted even if it answered.
    const state = await rehydrateWith({ relayer: RELAYER });

    expect(
      needsRehandshake({
        step: 'acknowledge-and-sign',
        partnerPeerId: null,
        provenanceOk: state.relayerFromPeerSession,
        rehandshakeSteps: REHANDSHAKE_WALLET_STEPS,
      })
    ).toBe(false);
  });
});

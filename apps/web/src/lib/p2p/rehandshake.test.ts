/**
 * Tests for the re-handshake that recovers a P2P flow after a mid-flow reload.
 *
 * The defect being prevented: `relayerFromPeerSession` / `forwarderFromPeerSession` are
 * session-only by design, `step` is persisted by design, and the only thing that set the flag
 * was an inbound CONNECT admitted at `wait-for-connection` alone. So a reload resumed at a sign
 * step with the signing gate permanently shut, while the error text promised a reconnection
 * that no code path in the app could perform.
 *
 * The two properties that matter, and that these tests hold apart:
 *   - the dead end is escapable (a reload at a sign step can recover);
 *   - escaping it still requires a live partner. Persisted state alone must never suffice,
 *     because the whole point of the flag is that a relayer address read back from
 *     localStorage may have been written by anyone with access to the browser profile.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  needsRehandshake,
  matchesPairedRelayer,
  sendRehandshakeConnect,
  REHANDSHAKE_WALLET_STEPS,
  REHANDSHAKE_TX_STEPS,
  REHANDSHAKE_FAILED_MESSAGE,
  SIGN_BLOCKED_MESSAGE,
} from './rehandshake';
import { STEP_SEQUENCES } from '@/stores/registrationStore';
import { TX_STEP_SEQUENCES } from '@/stores/transactionRegistrationStore';

const PARTNER = '12D3KooWTestPartnerPeerId';
const RELAYER = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';
const OTHER_RELAYER = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

// Base case: reloaded at the acknowledgement sign step, partner still pinned, flag false.
const reloadedAtSignStep = {
  step: 'acknowledge-and-sign' as const,
  partnerPeerId: PARTNER,
  provenanceOk: false,
  rehandshakeSteps: REHANDSHAKE_WALLET_STEPS,
};

describe('needsRehandshake', () => {
  it('detects the reload-at-a-sign-step dead end', () => {
    expect(needsRehandshake(reloadedAtSignStep)).toBe(true);
    expect(needsRehandshake({ ...reloadedAtSignStep, step: 'register-and-sign' })).toBe(true);
  });

  it('stays quiet when the handshake already happened this session', () => {
    // The ordinary path: no reload, so the flag is already true and nothing should be dialed.
    expect(needsRehandshake({ ...reloadedAtSignStep, provenanceOk: true })).toBe(false);
  });

  it('does not fire with no pinned partner — that is a restart, not a reconnect', () => {
    // With nothing pinned there is nobody to dial, and `authorizeStreamPeer` would reject
    // whatever answered. Retrying would only spin; the UI says "start over" instead.
    expect(needsRehandshake({ ...reloadedAtSignStep, partnerPeerId: null })).toBe(false);
  });

  it('does not fire outside the sign steps', () => {
    // Provenance gates exactly one thing — signing — so every other step is left alone. The
    // grace period especially: it is the anti-phishing delay, and nothing there needs a peer.
    for (const step of STEP_SEQUENCES.p2pRelay) {
      if ((REHANDSHAKE_WALLET_STEPS as readonly string[]).includes(step)) continue;
      expect(needsRehandshake({ ...reloadedAtSignStep, step }), step).toBe(false);
    }
  });

  it('does not fire before the flow has started', () => {
    expect(needsRehandshake({ ...reloadedAtSignStep, step: null })).toBe(false);
  });

  it('covers the transaction flow with its own step names', () => {
    const txBase = {
      partnerPeerId: PARTNER,
      provenanceOk: false,
      rehandshakeSteps: REHANDSHAKE_TX_STEPS,
    };
    expect(needsRehandshake({ ...txBase, step: 'acknowledge-sign' })).toBe(true);
    expect(needsRehandshake({ ...txBase, step: 'register-sign' })).toBe(true);

    for (const step of TX_STEP_SEQUENCES.p2pRelay) {
      if ((REHANDSHAKE_TX_STEPS as readonly string[]).includes(step)) continue;
      expect(needsRehandshake({ ...txBase, step }), step).toBe(false);
    }
  });

  it('names only steps that exist in each p2pRelay sequence', () => {
    // A typo here would make the recovery permanently unreachable — the same silent-inertness
    // failure `protocolSteps` guards against.
    for (const step of REHANDSHAKE_WALLET_STEPS) {
      expect(STEP_SEQUENCES.p2pRelay).toContain(step);
    }
    for (const step of REHANDSHAKE_TX_STEPS) {
      expect(TX_STEP_SEQUENCES.p2pRelay).toContain(step);
    }
  });
});

describe('matchesPairedRelayer', () => {
  it('adopts any well-formed address at the pairing step', () => {
    // Nothing is on file yet — this IS where the address is learned.
    expect(matchesPairedRelayer(true, RELAYER, null)).toBe(true);
    expect(matchesPairedRelayer(true, OTHER_RELAYER, RELAYER)).toBe(true);
  });

  it('requires agreement with the address on file past the pairing step', () => {
    expect(matchesPairedRelayer(false, RELAYER, RELAYER)).toBe(true);
  });

  it('compares case-insensitively', () => {
    // Persisted addresses are routinely re-cased; no security property here depends on casing.
    expect(matchesPairedRelayer(false, RELAYER.toLowerCase(), RELAYER)).toBe(true);
    expect(matchesPairedRelayer(false, RELAYER, RELAYER.toLowerCase())).toBe(true);
  });

  it('refuses a partner that names a DIFFERENT forwarder mid-flow', () => {
    // This is the check that stops a re-handshake becoming a second, quieter way to change the
    // address the victim signs over. The acknowledgement already on chain names the old one.
    expect(matchesPairedRelayer(false, OTHER_RELAYER, RELAYER)).toBe(false);
  });

  it('fails closed with nothing on file past the pairing step', () => {
    // No address to check against is not permission to adopt one.
    expect(matchesPairedRelayer(false, RELAYER, null)).toBe(false);
    expect(matchesPairedRelayer(false, RELAYER, undefined)).toBe(false);
  });
});

describe('sendRehandshakeConnect', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports failure rather than throwing when there is no node', async () => {
    await expect(
      sendRehandshakeConnect({
        getLibp2p: () => null,
        partnerPeerId: PARTNER,
        streamData: { success: true },
      })
    ).resolves.toBe(false);
  });

  it('reports failure rather than throwing when no partner is pinned', async () => {
    await expect(
      sendRehandshakeConnect({
        // A node with no partner to dial is still nothing to do.
        getLibp2p: () => ({}) as never,
        partnerPeerId: null,
        streamData: { success: true },
      })
    ).resolves.toBe(false);
  });
});

describe('recovery copy', () => {
  it('no longer promises a reconnection that does not exist', () => {
    // The old string was 'Please reconnect to your relayer before signing.' — there was no
    // control anywhere in the app that did that, so the only real escape was Start Over, and
    // if the acknowledgement had landed the relayer paid for a second one.
    for (const message of [REHANDSHAKE_FAILED_MESSAGE, SIGN_BLOCKED_MESSAGE]) {
      expect(message).not.toMatch(/reconnect to your relayer before signing/i);
    }
  });

  it('tells the user something they can actually do', () => {
    // Reloading re-arms the attempt (the attempt latch is a ref, so a fresh mount retries),
    // and the partner keeping their page open is the other half of what has to be true.
    expect(REHANDSHAKE_FAILED_MESSAGE).toMatch(/reload/i);
    expect(REHANDSHAKE_FAILED_MESSAGE).toMatch(/open/i);
    expect(SIGN_BLOCKED_MESSAGE).toMatch(/automatically/i);
  });
});

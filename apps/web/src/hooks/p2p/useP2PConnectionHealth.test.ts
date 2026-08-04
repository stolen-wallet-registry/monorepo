/**
 * Tests for useP2PConnectionHealth.
 *
 * The pure transition function (`computeHealthUpdate`) already has its own
 * tests; these cover the *hook* wiring around it — scheduling, the libp2p
 * readiness retry, the fire-once disconnect callbacks, and what happens to
 * peer-scoped health when `remotePeerId` changes mid-session (which is the
 * interesting case, because relay-scoped health must survive it while
 * peer-scoped health must not).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Libp2p } from '@libp2p/interface';

import { useP2PConnectionHealth } from './useP2PConnectionHealth';
import { useP2PStore } from '@/stores/p2pStore';

const h = vi.hoisted(() => ({
  relayConnected: true,
  relayLatency: null as number | null,
  peerConnected: true,
  peerLatency: null as number | null,
  checkPeerCalls: 0,
  /** Optional gate so a peer check can be held in flight. */
  peerGate: null as null | Promise<void>,
}));

vi.mock('./p2pConnectionHealthChecks', () => ({
  checkRelayConnection: () => ({ connected: h.relayConnected, latency: h.relayLatency }),
  checkPeerConnection: async () => {
    h.checkPeerCalls += 1;
    if (h.peerGate) await h.peerGate;
    return { connected: h.peerConnected, latency: h.peerLatency };
  },
}));

vi.mock('@/lib/p2p/types', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/p2p/types');
  return {
    ...actual,
    getRelayServers: () => [{ multiaddr: '/dns4/relay.test/tcp/443/wss/p2p/12D3KooRelay' }],
    extractPeerIdFromMultiaddr: () => '12D3KooRelay',
  };
});

const PEER_A = '12D3KooPeerA';
const PEER_B = '12D3KooPeerB';

/** Minimal libp2p stand-in — the health checks themselves are mocked. */
const fakeNode = { getConnections: () => [] } as unknown as Libp2p;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Disconnect callbacks are dispatched on a 0ms timeout scheduled from inside an
 * async check, so they land on the tick *after* the check that detected the
 * disconnect. This drains them without materially moving the clock.
 */
async function flushDisconnectCallbacks() {
  await advance(1);
}

/**
 * Mount runs two checks: one from the remotePeerId effect (fired immediately)
 * and one from the deferred initial timeout.
 */
const CHECKS_ON_MOUNT = 2;

interface Props {
  remotePeerId: string | null;
  enabled: boolean;
  node: Libp2p | null;
}

function render(overrides: Partial<Props> = {}) {
  const onRelayDisconnected = vi.fn();
  const onPeerDisconnected = vi.fn();
  const initialProps: Props = {
    remotePeerId: PEER_A,
    enabled: true,
    node: fakeNode,
    ...overrides,
  };
  const view = renderHook(
    (props: Props) =>
      useP2PConnectionHealth({
        getLibp2p: () => props.node,
        remotePeerId: props.remotePeerId,
        enabled: props.enabled,
        intervalMs: 30_000,
        onRelayDisconnected,
        onPeerDisconnected,
      }),
    { initialProps }
  );
  return { ...view, onRelayDisconnected, onPeerDisconnected, initialProps };
}

describe('useP2PConnectionHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.relayConnected = true;
    h.relayLatency = null;
    h.peerConnected = true;
    h.peerLatency = null;
    h.checkPeerCalls = 0;
    h.peerGate = null;
    useP2PStore.getState().setConnectedToPeer(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts unknown with nothing checked', () => {
      const { result } = render({ node: null, enabled: false });

      expect(result.current.health).toEqual({
        relayConnected: false,
        peerConnected: false,
        lastRelayPing: null,
        lastPeerPing: null,
        status: 'unknown',
        relayFailures: 0,
        peerFailures: 0,
        lastCheckAt: null,
      });
      expect(result.current.isChecking).toBe(false);
    });

    it('runs no scheduled checks while disabled', async () => {
      render({ enabled: false });
      await advance(90_000);

      // NOTE: current behaviour — the peer-change effect is not gated on
      // `enabled`, so mounting with a remotePeerId still performs exactly one
      // check. What `enabled` controls is the recurring schedule.
      expect(h.checkPeerCalls).toBe(1);
    });
  });

  describe('scheduling', () => {
    it('performs a deferred initial check and then one per interval', async () => {
      const { result } = render();

      await advance(0);
      expect(result.current.health.status).toBe('healthy');
      expect(result.current.health.lastCheckAt).not.toBeNull();
      const afterInitial = h.checkPeerCalls;
      expect(afterInitial).toBe(CHECKS_ON_MOUNT);

      await advance(30_000);
      expect(h.checkPeerCalls).toBe(afterInitial + 1);

      await advance(30_000);
      expect(h.checkPeerCalls).toBe(afterInitial + 2);
    });

    it('retries every second until libp2p becomes available', async () => {
      const { result, rerender } = render({ node: null });

      await advance(0);
      expect(h.checkPeerCalls).toBe(0);
      expect(result.current.health.lastCheckAt).toBeNull();

      await advance(3000);
      expect(h.checkPeerCalls).toBe(0);

      rerender({ remotePeerId: PEER_A, enabled: true, node: fakeNode });
      await advance(1000);

      expect(h.checkPeerCalls).toBeGreaterThanOrEqual(1);
      expect(result.current.health.lastCheckAt).not.toBeNull();
    });

    it('does nothing when libp2p is unavailable at check time', async () => {
      const { result } = render({ node: null });
      await advance(0);

      await act(async () => {
        await result.current.checkHealth();
      });

      expect(h.checkPeerCalls).toBe(0);
      expect(result.current.isChecking).toBe(false);
    });
  });

  describe('health transitions', () => {
    it('marks degraded on high peer latency', async () => {
      h.peerLatency = 5000;
      const { result } = render();
      await advance(0);

      expect(result.current.health.status).toBe('degraded');
      expect(result.current.health.lastPeerPing).toBe(5000);
    });

    it('counts consecutive peer failures and marks disconnected', async () => {
      h.peerConnected = false;
      const { result } = render();

      await advance(0);
      expect(result.current.health.peerFailures).toBe(CHECKS_ON_MOUNT);
      expect(result.current.health.status).toBe('disconnected');

      await advance(30_000);
      expect(result.current.health.peerFailures).toBe(CHECKS_ON_MOUNT + 1);
    });

    it('treats the relay as down when relay checks fail', async () => {
      h.relayConnected = false;
      const { result } = render({ remotePeerId: null });

      await advance(0);

      expect(result.current.health.relayConnected).toBe(false);
      expect(result.current.health.relayFailures).toBe(1);
      expect(result.current.health.status).toBe('disconnected');
    });

    it('lets a successful stream send override ping failures', async () => {
      // connectedToPeer is authoritative evidence of connectivity: real data
      // moved, so a failed ping must not report the link as down.
      h.peerConnected = false;
      h.relayConnected = false;
      act(() => {
        useP2PStore.getState().setConnectedToPeer(true);
      });

      const { result } = render();
      await advance(0);

      expect(result.current.health.relayConnected).toBe(true);
      expect(result.current.health.peerConnected).toBe(true);
      expect(result.current.health.status).toBe('healthy');
      // Ping failures are still tracked underneath.
      expect(result.current.health.peerFailures).toBe(CHECKS_ON_MOUNT);
    });
  });

  describe('disconnect callbacks', () => {
    it('does not fire on the very first check', async () => {
      h.peerConnected = false;
      h.relayConnected = false;
      const { onPeerDisconnected, onRelayDisconnected } = render();

      await advance(0);

      expect(onPeerDisconnected).not.toHaveBeenCalled();
      expect(onRelayDisconnected).not.toHaveBeenCalled();
    });

    it('fires once per disconnection event, not once per failing check', async () => {
      h.peerConnected = false;
      h.relayConnected = false;
      const { onPeerDisconnected, onRelayDisconnected } = render();

      await advance(0); // failure 1 - establishes lastCheckAt
      await advance(30_000); // failure 2 - crosses the threshold
      expect(onPeerDisconnected).toHaveBeenCalledTimes(1);
      expect(onRelayDisconnected).toHaveBeenCalledTimes(1);

      await advance(30_000); // failure 3 - already fired
      await advance(30_000); // failure 4
      expect(onPeerDisconnected).toHaveBeenCalledTimes(1);
      expect(onRelayDisconnected).toHaveBeenCalledTimes(1);
    });

    it('re-arms after a reconnection', async () => {
      h.peerConnected = false;
      h.relayConnected = false;
      const { onPeerDisconnected } = render();

      await advance(0);
      await advance(30_000);
      expect(onPeerDisconnected).toHaveBeenCalledTimes(1);

      h.peerConnected = true;
      h.relayConnected = true;
      await advance(30_000);

      h.peerConnected = false;
      await advance(30_000); // failure 1
      await advance(30_000); // failure 2 - crosses the threshold again
      await flushDisconnectCallbacks();
      expect(onPeerDisconnected).toHaveBeenCalledTimes(2);
    });

    it('clears the store connection flag when the peer disconnects', async () => {
      h.peerConnected = false;
      act(() => {
        useP2PStore.getState().setConnectedToPeer(true);
      });
      render();

      await advance(0);
      await advance(30_000);

      expect(useP2PStore.getState().connectedToPeer).toBe(false);
    });
  });

  describe('changing remotePeerId', () => {
    it('clears peer-scoped health immediately but keeps relay-scoped health', async () => {
      h.peerConnected = false;
      h.relayConnected = true;
      const { result, rerender } = render();

      await advance(0);
      expect(result.current.health.peerFailures).toBe(CHECKS_ON_MOUNT);
      expect(result.current.health.relayConnected).toBe(true);
      const statusBefore = result.current.health.status;

      // Hold the triggered check in flight so we observe the state the hook
      // presents between the peer changing and the new check completing.
      let releaseGate: (() => void) | undefined;
      h.peerGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });

      act(() => {
        rerender({ remotePeerId: PEER_B, enabled: true, node: fakeNode });
      });

      expect(result.current.health.peerConnected).toBe(false);
      expect(result.current.health.lastPeerPing).toBeNull();
      expect(result.current.health.peerFailures).toBe(0);
      // Relay-scoped values survive: they have nothing to do with the peer.
      expect(result.current.health.relayConnected).toBe(true);
      // No flicker to 'unknown' — the scheduled check will update it.
      expect(result.current.health.status).toBe(statusBefore);

      await act(async () => {
        releaseGate?.();
        await Promise.resolve();
      });
    });

    it('triggers an immediate check for the new peer', async () => {
      const { rerender } = render();
      await advance(0);
      const before = h.checkPeerCalls;

      await act(async () => {
        rerender({ remotePeerId: PEER_B, enabled: true, node: fakeNode });
      });

      expect(h.checkPeerCalls).toBe(before + 1);
    });

    it('does not trigger a check when the peer is cleared', async () => {
      const { rerender } = render();
      await advance(0);
      const before = h.checkPeerCalls;

      await act(async () => {
        rerender({ remotePeerId: null, enabled: true, node: fakeNode });
      });

      expect(h.checkPeerCalls).toBe(before);
    });

    it('starts a fresh failure streak for the new peer', async () => {
      // The failure counter belongs to the peer it was accumulated against; a
      // new peer must not inherit it and trip the disconnect callback on its
      // very first failing check.
      h.peerConnected = false;
      const { result, rerender, onPeerDisconnected } = render();

      await advance(0);
      expect(result.current.health.peerFailures).toBe(CHECKS_ON_MOUNT);
      // The mount streak already crossed the threshold for PEER_A.
      await flushDisconnectCallbacks();
      expect(onPeerDisconnected).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender({ remotePeerId: PEER_B, enabled: true, node: fakeNode });
      });

      // The immediate check for PEER_B is failure 1 of a brand new streak, so
      // it must not re-fire the disconnect callback.
      //
      // (Before peer-scoped health was derived from the peer tag, the reset went
      // through setHealth while the check triggered in the same commit read the
      // un-reset `healthRef` — so PEER_B inherited PEER_A's count of 2, read 3,
      // and reported PEER_B as disconnected after a single check.)
      expect(result.current.health.peerFailures).toBe(1);
      expect(onPeerDisconnected).toHaveBeenCalledTimes(1);

      // PEER_B's own second failure is what crosses the threshold.
      await advance(30_000);
      expect(result.current.health.peerFailures).toBeGreaterThanOrEqual(2);
      await flushDisconnectCallbacks();
      expect(onPeerDisconnected).toHaveBeenCalledTimes(2);
    });

    it('re-arms the disconnect callback for a peer that replaces a disconnected one', async () => {
      h.peerConnected = false;
      const { rerender, onPeerDisconnected } = render();

      await advance(0);
      await advance(30_000);
      expect(onPeerDisconnected).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender({ remotePeerId: PEER_B, enabled: true, node: fakeNode });
      });
      await advance(30_000);

      expect(onPeerDisconnected).toHaveBeenCalledTimes(2);
    });
  });

  describe('concurrency', () => {
    it('ignores a second check while one is in flight', async () => {
      let releaseGate: (() => void) | undefined;
      h.peerGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });

      const { result } = render();

      let first: Promise<void> | undefined;
      act(() => {
        first = result.current.checkHealth();
      });
      expect(h.checkPeerCalls).toBe(1);
      expect(result.current.isChecking).toBe(true);

      await act(async () => {
        await result.current.checkHealth();
      });
      expect(h.checkPeerCalls).toBe(1);

      await act(async () => {
        releaseGate?.();
        await first;
      });
      expect(result.current.isChecking).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('stops all timers on unmount', async () => {
      const { unmount } = render();
      await advance(0);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not run pending disconnect callbacks after unmount', async () => {
      h.peerConnected = false;
      const { unmount, onPeerDisconnected } = render();

      // advance(0) runs both mount checks, crossing the failure threshold and
      // leaving the disconnect callback pending on a 0ms timeout.
      await advance(0);
      expect(onPeerDisconnected).not.toHaveBeenCalled();

      unmount();
      await advance(1000);

      expect(onPeerDisconnected).not.toHaveBeenCalled();
    });
  });
});

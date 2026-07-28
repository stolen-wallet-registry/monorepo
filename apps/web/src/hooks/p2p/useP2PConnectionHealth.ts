/**
 * Hook to monitor P2P connection health for both relay server and peer.
 *
 * Tracks:
 * - Connection to relay server (via multiaddr check)
 * - Connection to partner peer (via ping)
 * - Overall health status
 *
 * DESIGN NOTE — peer-scoped vs. relay-scoped health
 * --------------------------------------------------
 * `ConnectionHealth` mixes two lifetimes. Relay-scoped fields (relayConnected,
 * lastRelayPing, relayFailures, lastCheckAt) live as long as the node does.
 * Peer-scoped fields (peerConnected, lastPeerPing, peerFailures) belong to one
 * specific `remotePeerId` and are meaningless once it changes.
 *
 * So the stored health is tagged with the peer it was measured against, and the
 * peer-scoped fields are cleared during render whenever the tag no longer
 * matches the current `remotePeerId`. That replaces the effect that used to
 * reset them, and — more importantly — closes a real hole: that effect wrote
 * through `setHealth`, which never updated `healthRef`, so the health check it
 * triggered in the same commit read the *previous* peer's failure count and
 * immediately re-fired `onPeerDisconnected` for a peer that had only been
 * checked once. Deriving from the tag means every reader, ref included, sees
 * the cleared value from the very first render of the new peer.
 *
 * `peerDisconnectedFiredForRef` follows the same idea: it records the peer it
 * fired for instead of a boolean that has to be reset.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { Libp2p } from '@libp2p/interface';

import { logger } from '@/lib/logger';
import { getRelayServers, extractPeerIdFromMultiaddr } from '@/lib/p2p/types';
import { useP2PStore } from '@/stores/p2pStore';
import { checkRelayConnection, checkPeerConnection } from './p2pConnectionHealthChecks';
import { computeHealthUpdate } from './p2pConnectionHealthState';

/** Health check interval in milliseconds (30 seconds) */
const HEALTH_CHECK_INTERVAL_MS = 30_000;

/** Maximum latency before marking as degraded (3 seconds) */
const DEGRADED_LATENCY_MS = 3_000;

/** Maximum consecutive failures before marking disconnected */
const MAX_FAILURES_BEFORE_DISCONNECT = 2;

export type ConnectionStatus = 'healthy' | 'degraded' | 'disconnected' | 'unknown';

export interface ConnectionHealth {
  /** Whether connected to relay server */
  relayConnected: boolean;
  /** Whether connected to partner peer */
  peerConnected: boolean;
  /** Last relay ping latency in ms */
  lastRelayPing: number | null;
  /** Last peer ping latency in ms */
  lastPeerPing: number | null;
  /** Overall connection status */
  status: ConnectionStatus;
  /** Number of consecutive relay failures */
  relayFailures: number;
  /** Number of consecutive peer failures */
  peerFailures: number;
  /** Last successful health check timestamp */
  lastCheckAt: number | null;
}

export interface UseP2PConnectionHealthOptions {
  /** Getter function for the libp2p node (avoids ref access during render) */
  getLibp2p: () => Libp2p | null;
  /** Remote peer ID to monitor (optional) */
  remotePeerId?: string | null;
  /** Whether health monitoring is enabled */
  enabled?: boolean;
  /** Health check interval in ms (default: 30s) */
  intervalMs?: number;
  /** Callback when relay connection is lost */
  onRelayDisconnected?: () => void;
  /** Callback when peer connection is lost */
  onPeerDisconnected?: () => void;
}

export interface UseP2PConnectionHealthResult {
  /** Current connection health */
  health: ConnectionHealth;
  /** Manually trigger a health check */
  checkHealth: () => Promise<void>;
  /** Whether currently checking health */
  isChecking: boolean;
}

const INITIAL_HEALTH: ConnectionHealth = {
  relayConnected: false,
  peerConnected: false,
  lastRelayPing: null,
  lastPeerPing: null,
  status: 'unknown',
  relayFailures: 0,
  peerFailures: 0,
  lastCheckAt: null,
};

/** Health measurements together with the peer they were measured against. */
interface TaggedHealth {
  peerScope: string | null;
  value: ConnectionHealth;
}

/**
 * Health as it applies to `peerScope`. When the tag matches, that is the stored
 * value verbatim; when it does not, the peer-scoped measurements belong to a
 * peer we are no longer monitoring and are cleared.
 *
 * `status` is deliberately carried over rather than reset to 'unknown': the
 * scheduled check will recompute it, and blanking it flickers the UI.
 */
function forPeerScope(stored: TaggedHealth, peerScope: string | null): ConnectionHealth {
  if (stored.peerScope === peerScope) return stored.value;
  return {
    ...stored.value,
    peerConnected: false,
    lastPeerPing: null,
    peerFailures: 0,
  };
}

/**
 * Monitors P2P connection health for both relay server and peer.
 *
 * This hook provides a comprehensive view of connection status and
 * can detect relay disconnection before message sends fail.
 *
 * @example
 * ```tsx
 * const { health } = useP2PConnectionHealth({
 *   libp2p,
 *   remotePeerId: partnerPeerId,
 * });
 *
 * if (health.status === 'disconnected') {
 *   showReconnectUI();
 * }
 * ```
 */
export function useP2PConnectionHealth({
  getLibp2p,
  remotePeerId,
  enabled = true,
  intervalMs = HEALTH_CHECK_INTERVAL_MS,
  onRelayDisconnected,
  onPeerDisconnected,
}: UseP2PConnectionHealthOptions): UseP2PConnectionHealthResult {
  // Normalized peer identity used as the health tag (undefined and null are the
  // same thing here: "no peer").
  const peerScope = remotePeerId ?? null;

  const [healthState, setHealthState] = useState<TaggedHealth>(() => ({
    peerScope,
    value: INITIAL_HEALTH,
  }));
  const [isChecking, setIsChecking] = useState(false);

  // Mirrors `healthState` so checkHealth can read the previous value without a state
  // updater. See the comment in checkHealth for why the transition is not computed
  // inside setHealth.
  const healthRef = useRef(healthState);

  /** The health to present/build on, with stale peer-scoped fields cleared. */
  const health = useMemo(() => forPeerScope(healthState, peerScope), [healthState, peerScope]);

  // Subscribe to store's connectedToPeer - set when passStreamData/readStreamData succeeds
  // This is authoritative evidence of connectivity that overrides ping-based checks
  const storeConnectedToPeer = useP2PStore((s) => s.connectedToPeer);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayDisconnectedFiredRef = useRef(false);
  // The peer we already fired onPeerDisconnected for; null means "not fired".
  // Unambiguous because a disconnect is only ever reported when a peer is set.
  const peerDisconnectedFiredForRef = useRef<string | null>(null);
  // Guard against concurrent health checks (use ref, not state, to avoid dep cycles)
  const isCheckingRef = useRef(false);
  // Track disconnect callback timeouts for cleanup on unmount
  const disconnectTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Use ref for getter to avoid effect re-runs
  const getLibp2pRef = useRef(getLibp2p);
  useEffect(() => {
    getLibp2pRef.current = getLibp2p;
  });

  // Use refs for callbacks to avoid effect re-runs
  const onRelayDisconnectedRef = useRef(onRelayDisconnected);
  useEffect(() => {
    onRelayDisconnectedRef.current = onRelayDisconnected;
  });
  const onPeerDisconnectedRef = useRef(onPeerDisconnected);
  useEffect(() => {
    onPeerDisconnectedRef.current = onPeerDisconnected;
  });

  // Get relay peer IDs for connection checks
  const relayPeerIds = useMemo(() => {
    try {
      const servers = getRelayServers();
      return servers
        .map((s) => extractPeerIdFromMultiaddr(s.multiaddr))
        .filter((id): id is string => id !== null);
    } catch {
      return [];
    }
  }, []);

  const relayIdsRef = useRef(relayPeerIds);
  useEffect(() => {
    relayIdsRef.current = relayPeerIds;
  });

  // Main health check function
  const checkHealth = useCallback(async (): Promise<void> => {
    const libp2p = getLibp2pRef.current();
    if (!libp2p) {
      return;
    }

    // Skip if already checking (prevents concurrent checks from interval + manual trigger)
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      const connections = libp2p.getConnections();

      // Check relay connection
      const relayResult = checkRelayConnection(connections, relayIdsRef.current);

      // Check peer connection if peer ID provided
      let peerResult = { connected: false, latency: null as number | null };
      if (remotePeerId) {
        peerResult = await checkPeerConnection(libp2p, remotePeerId);
      }

      // Update health state.
      //
      // The transition is computed here rather than inside a setHealth(prev => ...) updater.
      // State updaters must be pure: React may invoke them more than once for a single
      // update (StrictMode double-invocation, or a render that gets discarded and replayed
      // under concurrent rendering). This block mutates `*FiredRef` latches and schedules
      // timeouts that call the caller's disconnect handlers, so running it twice fired the
      // "relay disconnected" / "peer disconnected" callbacks twice and leaked the duplicate
      // timeouts. `healthRef` gives us the previous value outside the updater; `isCheckingRef`
      // guarantees only one check is in flight, so it cannot be stale here.
      //
      // Note: storeConnectedToPeer is captured at render time and reflects the latest
      // store value. If passStreamData/readStreamData succeeded, this will be true.
      //
      // `prev` goes through forPeerScope for the same reason the render does: a
      // check triggered by a peer change runs in that very commit, before any
      // effect could have re-synced the ref, so reading it raw would inherit the
      // previous peer's failure streak.
      const prev = forPeerScope(healthRef.current, peerScope);
      const update = computeHealthUpdate({
        prev,
        relay: relayResult,
        peer: peerResult,
        storeConnectedToPeer,
        hasRemotePeer: !!remotePeerId,
        now: Date.now(),
        maxFailuresBeforeDisconnect: MAX_FAILURES_BEFORE_DISCONNECT,
        degradedLatencyMs: DEGRADED_LATENCY_MS,
      });

      // Commit the new state, and keep healthRef in step immediately so a check that starts
      // before React re-renders still sees the value this one produced.
      healthRef.current = { peerScope, value: update.next };
      setHealthState(healthRef.current);

      // Fire callbacks once per disconnection event (only if we had a connection before).
      // Timeouts are tracked in disconnectTimeoutsRef for cleanup on unmount.
      let peerDisconnectDetected = false;

      if (
        update.relayDisconnected &&
        !relayDisconnectedFiredRef.current &&
        prev.lastCheckAt !== null
      ) {
        relayDisconnectedFiredRef.current = true;
        logger.p2p.info('Relay disconnect detected', {
          relayFailures: update.next.relayFailures,
        });
        const timeoutId = setTimeout(() => {
          disconnectTimeoutsRef.current.delete(timeoutId);
          onRelayDisconnectedRef.current?.();
        }, 0);
        disconnectTimeoutsRef.current.add(timeoutId);
      }

      if (
        update.peerDisconnected &&
        peerDisconnectedFiredForRef.current !== peerScope &&
        prev.lastCheckAt !== null
      ) {
        peerDisconnectedFiredForRef.current = peerScope;
        logger.p2p.info('Peer disconnect detected after consecutive ping failures', {
          peerFailures: update.next.peerFailures,
          remotePeerId,
        });
        const timeoutId = setTimeout(() => {
          disconnectTimeoutsRef.current.delete(timeoutId);
          onPeerDisconnectedRef.current?.();
        }, 0);
        disconnectTimeoutsRef.current.add(timeoutId);
        peerDisconnectDetected = true;
      }

      // Reset fired flags if reconnected
      if (update.resetRelayDisconnectedFlag) {
        relayDisconnectedFiredRef.current = false;
      }
      if (update.resetPeerDisconnectedFlag) {
        peerDisconnectedFiredForRef.current = null;
      }

      // Update the external Zustand store outside of React's state computation.
      if (peerDisconnectDetected) {
        useP2PStore.getState().setConnectedToPeer(false);
      }

      logger.p2p.debug('Health check complete', {
        relayConnected: relayResult.connected,
        peerPingConnected: peerResult.connected,
        storeConnectedToPeer,
        peerLatency: peerResult.latency,
      });
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [remotePeerId, peerScope, storeConnectedToPeer]);

  // Use ref for checkHealth to avoid effect re-runs. Assigned in an effect, not during
  // render: writing to a ref while rendering is a side effect, and under StrictMode /
  // concurrent rendering a render can be thrown away, leaving the ref pointing at a
  // closure that was never committed.
  const checkHealthRef = useRef(checkHealth);
  useEffect(() => {
    checkHealthRef.current = checkHealth;
  });

  // Set up periodic health checks
  // Note: libp2p might not be ready when this effect first runs,
  // so we check inside the interval callback, not at setup time
  useEffect(() => {
    if (!enabled) {
      // Clear interval if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    logger.p2p.debug('Starting P2P connection health monitoring', {
      intervalMs,
      hasRemotePeer: !!remotePeerId,
    });

    // Track if we've done at least one successful check
    let hasChecked = false;

    // Health check that only runs if libp2p is available
    // If not available, schedules a quick retry
    const doHealthCheck = () => {
      const libp2p = getLibp2pRef.current();
      if (libp2p) {
        hasChecked = true;
        // Clear any pending retry timeout since we're now ready
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        checkHealthRef.current();
      } else if (!hasChecked) {
        // Clear existing retry before scheduling new one to prevent accumulation
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        // libp2p not ready yet - retry in 1 second
        retryTimeoutRef.current = setTimeout(doHealthCheck, 1000);
      }
    };

    // Initial check (deferred)
    const initialTimeout = setTimeout(doHealthCheck, 0);

    // Set up interval - will start checking once libp2p is ready
    intervalRef.current = setInterval(doHealthCheck, intervalMs);

    // Capture ref values for cleanup to avoid stale refs
    const disconnectTimeouts = disconnectTimeoutsRef.current;

    return () => {
      clearTimeout(initialTimeout);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear any pending disconnect callback timeouts
      for (const timeoutId of disconnectTimeouts) {
        clearTimeout(timeoutId);
      }
      disconnectTimeouts.clear();
    };
    // Note: getLibp2p excluded from deps - accessed via ref
  }, [enabled, intervalMs, remotePeerId]);

  // Get fresh numbers for a new peer as soon as it appears. No state is reset
  // here: peer-scoped health is derived from the tag (see forPeerScope), so it
  // is already cleared in the render that introduced the new peer — including
  // for this check, which reads through the same helper.
  useEffect(() => {
    if (remotePeerId) {
      checkHealthRef.current();
    }
  }, [remotePeerId]);

  return {
    health,
    checkHealth,
    isChecking,
  };
}

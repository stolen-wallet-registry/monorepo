/**
 * Hook to monitor P2P connection health for both relay server and peer.
 *
 * Tracks:
 * - Connection to relay server (via multiaddr check)
 * - Connection to partner peer (via ping)
 * - Overall health status
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { Libp2p } from '@libp2p/interface';

import { logger } from '@/lib/logger';
import { getRelayServers, extractPeerIdFromMultiaddr } from '@/lib/p2p/types';
import { useP2PStore } from '@/stores/p2pStore';
import { checkRelayConnection, checkPeerConnection } from '@/hooks/p2pConnectionHealthChecks';
import { computeHealthUpdate } from '@/hooks/p2pConnectionHealthState';

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
  const [health, setHealth] = useState<ConnectionHealth>({
    relayConnected: false,
    peerConnected: false,
    lastRelayPing: null,
    lastPeerPing: null,
    status: 'unknown',
    relayFailures: 0,
    peerFailures: 0,
    lastCheckAt: null,
  });
  const [isChecking, setIsChecking] = useState(false);

  // Subscribe to store's connectedToPeer - set when passStreamData/readStreamData succeeds
  // This is authoritative evidence of connectivity that overrides ping-based checks
  const storeConnectedToPeer = useP2PStore((s) => s.connectedToPeer);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayDisconnectedFiredRef = useRef(false);
  const peerDisconnectedFiredRef = useRef(false);
  // Track if store update is needed after setState (to avoid side effects inside updater)
  const pendingStoreUpdateRef = useRef(false);
  // Guard against concurrent health checks (use ref, not state, to avoid dep cycles)
  const isCheckingRef = useRef(false);
  // Track disconnect callback timeouts for cleanup on unmount
  const disconnectTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Use ref for getter to avoid effect re-runs
  const getLibp2pRef = useRef(getLibp2p);
  useEffect(() => {
    getLibp2pRef.current = getLibp2p;
  }, [getLibp2p]);

  // Use refs for callbacks to avoid effect re-runs
  const onRelayDisconnectedRef = useRef(onRelayDisconnected);
  useEffect(() => {
    onRelayDisconnectedRef.current = onRelayDisconnected;
  }, [onRelayDisconnected]);
  const onPeerDisconnectedRef = useRef(onPeerDisconnected);
  useEffect(() => {
    onPeerDisconnectedRef.current = onPeerDisconnected;
  }, [onPeerDisconnected]);

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
  }, [relayPeerIds]);

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

      // Update health state
      // Note: storeConnectedToPeer is captured at render time and reflects the latest
      // store value. If passStreamData/readStreamData succeeded, this will be true.
      // Reset pending store update flag before setState
      pendingStoreUpdateRef.current = false;

      setHealth((prev) => {
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

        // Fire callbacks once per disconnection event (only if we had a connection before)
        // Note: Using setTimeout to defer side effects outside the updater
        // Timeouts are tracked in disconnectTimeoutsRef for cleanup on unmount
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
          !peerDisconnectedFiredRef.current &&
          prev.lastCheckAt !== null
        ) {
          peerDisconnectedFiredRef.current = true;
          logger.p2p.info('Peer disconnect detected after consecutive ping failures', {
            peerFailures: update.next.peerFailures,
            remotePeerId,
          });
          const timeoutId = setTimeout(() => {
            disconnectTimeoutsRef.current.delete(timeoutId);
            onPeerDisconnectedRef.current?.();
          }, 0);
          disconnectTimeoutsRef.current.add(timeoutId);
          // Mark that we need to update store after setState completes
          pendingStoreUpdateRef.current = true;
        }

        // Reset fired flags if reconnected
        if (update.resetRelayDisconnectedFlag) {
          relayDisconnectedFiredRef.current = false;
        }
        if (update.resetPeerDisconnectedFlag) {
          peerDisconnectedFiredRef.current = false;
        }

        return update.next;
      });

      // Execute side effects after setState completes
      if (pendingStoreUpdateRef.current) {
        // Reset store to false - ping failures have proven the connection is lost
        // This makes the store symmetric: true on success, false on proven disconnect
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
  }, [remotePeerId, storeConnectedToPeer]);

  // Use ref for checkHealth to avoid effect re-runs
  const checkHealthRef = useRef(checkHealth);
  checkHealthRef.current = checkHealth;

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

  // Reset peer-specific state when peer changes, but keep relay status
  // Don't reset to 'unknown' - trigger immediate check instead
  useEffect(() => {
    peerDisconnectedFiredRef.current = false;
    setHealth((prev) => ({
      ...prev,
      peerConnected: false,
      lastPeerPing: null,
      peerFailures: 0,
      // Keep current status - the scheduled check will update it
      // This prevents flicker to 'unknown' or 'disconnected'
    }));
    // Trigger immediate health check when peer changes
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

/**
 * Hook to monitor P2P connection health for both relay server and peer.
 *
 * Tracks:
 * - Connection to relay server (via multiaddr check)
 * - Connection to partner peer (via ping)
 * - Overall health status
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { Libp2p, Connection } from '@libp2p/interface';
import type { Ping } from '@libp2p/ping';
import { peerIdFromString } from '@libp2p/peer-id';

import { logger } from '@/lib/logger';
import { getRelayServers, extractPeerIdFromMultiaddr } from '@/lib/p2p/types';
import { useP2PStore } from '@/stores/p2pStore';

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
  const relayDisconnectedFiredRef = useRef(false);
  const peerDisconnectedFiredRef = useRef(false);

  // Use ref for getter to avoid effect re-runs
  const getLibp2pRef = useRef(getLibp2p);
  useEffect(() => {
    getLibp2pRef.current = getLibp2p;
  }, [getLibp2p]);

  // Use refs for callbacks to avoid effect re-runs
  const onRelayDisconnectedRef = useRef(onRelayDisconnected);
  onRelayDisconnectedRef.current = onRelayDisconnected;
  const onPeerDisconnectedRef = useRef(onPeerDisconnected);
  onPeerDisconnectedRef.current = onPeerDisconnected;

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

  // Check if connected to any relay server
  const checkRelayConnection = useCallback(
    (connections: Connection[]): { connected: boolean; latency: number | null } => {
      if (!relayPeerIds.length) {
        return { connected: false, latency: null };
      }

      // Check if we have an open connection to any relay
      const relayConnection = connections.find((conn) =>
        relayPeerIds.some((relayId) => conn.remotePeer.toString() === relayId)
      );

      if (relayConnection && relayConnection.status === 'open') {
        return { connected: true, latency: null };
      }

      return { connected: false, latency: null };
    },
    [relayPeerIds]
  );

  // Check peer connection with ping
  const checkPeerConnection = useCallback(
    async (
      node: Libp2p,
      peerId: string
    ): Promise<{ connected: boolean; latency: number | null }> => {
      try {
        const parsedPeerId = peerIdFromString(peerId);
        const pingService = (node.services as { ping?: Ping }).ping;

        if (!pingService) {
          logger.p2p.warn('Ping service not available for health check');
          return { connected: false, latency: null };
        }

        const startTime = performance.now();
        await pingService.ping(parsedPeerId);
        const latency = Math.round(performance.now() - startTime);

        return { connected: true, latency };
      } catch {
        return { connected: false, latency: null };
      }
    },
    []
  );

  // Compute overall status from individual checks
  const computeStatus = useCallback(
    (
      relayConnected: boolean,
      peerConnected: boolean,
      relayLatency: number | null,
      peerLatency: number | null
    ): ConnectionStatus => {
      // Disconnected if relay is down (can't communicate at all)
      if (!relayConnected) {
        return 'disconnected';
      }

      // If we're supposed to have a peer, check peer status
      if (remotePeerId) {
        if (!peerConnected) {
          return 'disconnected';
        }

        // Check for high latency (degraded)
        if (peerLatency && peerLatency > DEGRADED_LATENCY_MS) {
          return 'degraded';
        }
      }

      // Check relay latency
      if (relayLatency && relayLatency > DEGRADED_LATENCY_MS) {
        return 'degraded';
      }

      return 'healthy';
    },
    [remotePeerId]
  );

  // Main health check function
  const checkHealth = useCallback(async (): Promise<void> => {
    const libp2p = getLibp2pRef.current();
    if (!libp2p) {
      return;
    }

    setIsChecking(true);

    try {
      const connections = libp2p.getConnections();

      // Check relay connection
      const relayResult = checkRelayConnection(connections);

      // Check peer connection if peer ID provided
      let peerResult = { connected: false, latency: null as number | null };
      if (remotePeerId) {
        peerResult = await checkPeerConnection(libp2p, remotePeerId);
      }

      // Update health state
      // Note: storeConnectedToPeer is captured at render time and reflects the latest
      // store value. If passStreamData/readStreamData succeeded, this will be true.
      setHealth((prev) => {
        // Store says connected if we recently sent/received data successfully
        // This overrides ping failures since actual message passing proves connectivity
        const effectivePeerConnected = peerResult.connected || storeConnectedToPeer;

        const newRelayFailures = relayResult.connected ? 0 : prev.relayFailures + 1;
        // Always track ping failures - we need to detect disconnect even if store says connected
        // The store provides "benefit of doubt" for UI status, but doesn't prevent failure detection
        const newPeerFailures = peerResult.connected ? 0 : prev.peerFailures + 1;

        // Determine if we should fire disconnection callbacks
        // Only fire after consecutive failures, not on first check
        const relayDisconnected = newRelayFailures >= MAX_FAILURES_BEFORE_DISCONNECT;
        const peerDisconnected = remotePeerId && newPeerFailures >= MAX_FAILURES_BEFORE_DISCONNECT;

        // Fire callbacks once per disconnection event (only if we had a connection before)
        if (relayDisconnected && !relayDisconnectedFiredRef.current && prev.lastCheckAt !== null) {
          relayDisconnectedFiredRef.current = true;
          logger.p2p.info('Relay disconnect detected', { relayFailures: newRelayFailures });
          setTimeout(() => onRelayDisconnectedRef.current?.(), 0);
        }
        if (peerDisconnected && !peerDisconnectedFiredRef.current && prev.lastCheckAt !== null) {
          peerDisconnectedFiredRef.current = true;
          logger.p2p.info('Peer disconnect detected after consecutive ping failures', {
            peerFailures: newPeerFailures,
            remotePeerId,
          });
          setTimeout(() => onPeerDisconnectedRef.current?.(), 0);
          // Reset store to false - ping failures have proven the connection is lost
          // This makes the store symmetric: true on success, false on proven disconnect
          useP2PStore.getState().setConnectedToPeer(false);
        }

        // Reset fired flags if reconnected
        if (relayResult.connected) {
          relayDisconnectedFiredRef.current = false;
        }
        if (effectivePeerConnected) {
          peerDisconnectedFiredRef.current = false;
        }

        const status = computeStatus(
          relayResult.connected,
          effectivePeerConnected,
          relayResult.latency,
          peerResult.latency
        );

        return {
          relayConnected: relayResult.connected,
          peerConnected: effectivePeerConnected,
          lastRelayPing: relayResult.latency,
          lastPeerPing: peerResult.latency,
          status,
          relayFailures: newRelayFailures,
          peerFailures: newPeerFailures,
          lastCheckAt: Date.now(),
        };
      });

      logger.p2p.debug('Health check complete', {
        relayConnected: relayResult.connected,
        peerPingConnected: peerResult.connected,
        storeConnectedToPeer,
        peerLatency: peerResult.latency,
      });
    } finally {
      setIsChecking(false);
    }
  }, [
    remotePeerId,
    checkRelayConnection,
    checkPeerConnection,
    computeStatus,
    storeConnectedToPeer,
  ]);

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
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    // Health check that only runs if libp2p is available
    // If not available, schedules a quick retry
    const doHealthCheck = () => {
      const libp2p = getLibp2pRef.current();
      if (libp2p) {
        hasChecked = true;
        checkHealthRef.current();
      } else if (!hasChecked) {
        // libp2p not ready yet - retry in 1 second
        retryTimeout = setTimeout(doHealthCheck, 1000);
      }
    };

    // Initial check (deferred)
    const initialTimeout = setTimeout(doHealthCheck, 0);

    // Set up interval - will start checking once libp2p is ready
    intervalRef.current = setInterval(doHealthCheck, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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

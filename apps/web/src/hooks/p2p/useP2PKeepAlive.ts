/**
 * Hook to maintain P2P connection during long waits (e.g., grace period).
 *
 * Uses libp2p's ping service to keep circuit relay connections alive.
 * Without this, connections drop after ~2 minutes of inactivity.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { Libp2p, PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import type { Ping } from '@libp2p/ping';

import { logger } from '@/lib/logger';

/** Default ping interval in milliseconds (45 seconds) */
const DEFAULT_PING_INTERVAL_MS = 45_000;

/** Maximum ping latency before warning (5 seconds) */
const MAX_PING_LATENCY_MS = 5_000;

/** Number of consecutive failures before marking unhealthy */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface UseP2PKeepAliveOptions {
  /** Getter function for the libp2p node (avoids ref access during render) */
  getLibp2p: () => Libp2p | null;
  /** Remote peer ID to keep alive */
  remotePeerId: string | null;
  /** Whether keep-alive is enabled */
  enabled?: boolean;
  /** Ping interval in milliseconds (default: 45s) */
  pingIntervalMs?: number;
  /** Callback when connection is lost and cannot be recovered */
  onConnectionLost?: () => void;
}

export interface UseP2PKeepAliveResult {
  /** Whether keep-alive is active */
  isActive: boolean;
  /** Last ping latency in ms, null if not pinged yet */
  lastPingLatency: number | null;
  /** Whether connection appears healthy */
  isHealthy: boolean;
  /** Manually trigger a ping */
  ping: () => Promise<number | null>;
}

/**
 * Maintains P2P connection during periods of inactivity.
 *
 * Circuit relay connections have a reservation timeout (typically ~2 minutes).
 * This hook periodically pings the remote peer to keep the connection alive.
 *
 * @example
 * ```tsx
 * const { isHealthy } = useP2PKeepAlive({
 *   libp2p,
 *   remotePeerId: partnerPeerId,
 *   enabled: step === 'grace-period',
 * });
 * ```
 */
export function useP2PKeepAlive({
  getLibp2p,
  remotePeerId,
  enabled = true,
  pingIntervalMs = DEFAULT_PING_INTERVAL_MS,
  onConnectionLost,
}: UseP2PKeepAliveOptions): UseP2PKeepAliveResult {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const prevRemotePeerIdRef = useRef<string | null>(null);
  const connectionLostFiredRef = useRef(false);

  // Use ref for callback to avoid effect re-runs when caller doesn't memoize
  const onConnectionLostRef = useRef(onConnectionLost);
  useEffect(() => {
    onConnectionLostRef.current = onConnectionLost;
  }, [onConnectionLost]);

  // Use ref for getter to avoid effect re-runs
  const getLibp2pRef = useRef(getLibp2p);
  useEffect(() => {
    getLibp2pRef.current = getLibp2p;
  }, [getLibp2p]);

  // Use state for values returned during render
  const [lastPingLatency, setLastPingLatency] = useState<number | null>(null);
  const [isHealthy, setIsHealthy] = useState(true);

  // Track whether node is available (updated via effect)
  const [hasNode, setHasNode] = useState(false);

  // Derive isActive from inputs
  const isActive = enabled && hasNode && !!remotePeerId;

  // Parse peer ID once and memoize
  const parsedPeerId = useMemo((): PeerId | null => {
    if (!remotePeerId) {
      return null;
    }
    try {
      return peerIdFromString(remotePeerId);
    } catch {
      logger.p2p.warn('Invalid remote peer ID for keep-alive', { remotePeerId });
      return null;
    }
  }, [remotePeerId]);

  // Ping function using libp2p's ping service
  const ping = useCallback(async (): Promise<number | null> => {
    const libp2p = getLibp2pRef.current();
    if (!libp2p || !parsedPeerId) {
      return null;
    }

    try {
      // Access the ping service from libp2p services
      // Type assertion needed because services are dynamically typed
      const pingService = (libp2p.services as { ping?: Ping }).ping;
      if (!pingService) {
        logger.p2p.warn('Ping service not available on libp2p node');
        return null;
      }

      const startTime = performance.now();
      await pingService.ping(parsedPeerId);
      const latency = Math.round(performance.now() - startTime);

      setLastPingLatency(latency);
      consecutiveFailuresRef.current = 0;
      setIsHealthy(true);

      if (latency > MAX_PING_LATENCY_MS) {
        logger.p2p.warn('High ping latency', { latency, remotePeerId });
      } else {
        logger.p2p.debug('Keep-alive ping successful', { latency, remotePeerId });
      }

      return latency;
    } catch (err) {
      consecutiveFailuresRef.current += 1;
      logger.p2p.warn('Keep-alive ping failed', {
        remotePeerId,
        consecutiveFailures: consecutiveFailuresRef.current,
        error: err instanceof Error ? err.message : 'Unknown error',
      });

      // After MAX_CONSECUTIVE_FAILURES, mark as unhealthy and fire callback once
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setIsHealthy(false);
        // Only call onConnectionLost once per connection
        if (!connectionLostFiredRef.current) {
          connectionLostFiredRef.current = true;
          onConnectionLostRef.current?.();
        }
      }

      return null;
    }
  }, [parsedPeerId, remotePeerId]);

  // Use ref for ping function to avoid effect re-runs
  const pingRef = useRef(ping);
  useEffect(() => {
    pingRef.current = ping;
  }, [ping]);

  // Set up periodic pinging
  useEffect(() => {
    // Track timeout for state reset cleanup
    let resetStateTimeout: ReturnType<typeof setTimeout> | null = null;

    // Reset state when remotePeerId changes
    if (remotePeerId !== prevRemotePeerIdRef.current) {
      prevRemotePeerIdRef.current = remotePeerId;
      consecutiveFailuresRef.current = 0;
      connectionLostFiredRef.current = false;
      // Reset state for new peer (deferred to avoid synchronous setState in effect)
      resetStateTimeout = setTimeout(() => {
        setIsHealthy(true);
        setLastPingLatency(null);
      }, 0);
    }

    // Get current libp2p instance
    const libp2p = getLibp2pRef.current();
    const nodeAvailable = !!libp2p;
    setHasNode(nodeAvailable);

    if (!enabled || !libp2p || !remotePeerId) {
      // Clear interval if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    logger.p2p.info('Starting P2P keep-alive', {
      remotePeerId,
      intervalMs: pingIntervalMs,
    });

    // Ping immediately to establish baseline (deferred to avoid synchronous setState in effect)
    const initialPingTimeout = setTimeout(() => {
      pingRef.current();
    }, 0);

    // Set up interval - use ref to avoid recreating interval when ping changes
    intervalRef.current = setInterval(() => {
      pingRef.current();
    }, pingIntervalMs);

    return () => {
      if (resetStateTimeout) {
        clearTimeout(resetStateTimeout);
      }
      clearTimeout(initialPingTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        logger.p2p.debug('Stopped P2P keep-alive', { remotePeerId });
      }
    };
    // Note: ping and getLibp2p excluded from deps - accessed via refs to prevent effect re-runs
  }, [enabled, remotePeerId, pingIntervalMs]);

  return {
    isActive,
    lastPingLatency,
    isHealthy,
    ping,
  };
}

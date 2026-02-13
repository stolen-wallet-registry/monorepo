/**
 * Hook to check if the P2P relay server is actually reachable.
 *
 * Unlike `isP2PAvailable()` which only checks config, this performs a
 * lightweight WebSocket handshake to the relay server. The relay is a
 * libp2p WebSocket server, so a successful WS open proves it's running.
 * A connection error or timeout means it's unreachable.
 *
 * Uses WebSocket instead of fetch to avoid browser console noise —
 * fetch to a WS server returns HTTP 400 which the browser logs as an error.
 */

import { useState, useEffect } from 'react';
import { getRelayServers } from '@/lib/p2p/types';
import { logger } from '@/lib/logger';

/** Timeout for relay connectivity check (ms) */
const CHECK_TIMEOUT_MS = 3000;

/**
 * Extract a WebSocket URL from a libp2p multiaddr.
 *
 * Parses `/ip4/{ip}/tcp/{port}/ws/...` → `ws://{ip}:{port}`
 */
function extractWsUrl(multiaddr: string): string | null {
  const ipMatch = multiaddr.match(/\/ip4\/([^/]+)/);
  const portMatch = multiaddr.match(/\/tcp\/(\d+)/);
  if (!ipMatch || !portMatch) return null;
  return `ws://${ipMatch[1]}:${portMatch[1]}`;
}

/**
 * Probe a WebSocket endpoint for reachability.
 *
 * Opens a WebSocket connection to the relay server. If the handshake
 * succeeds (onopen), the server is alive. If it fails (onerror) or
 * times out, the server is unreachable.
 */
function probeRelay(wsUrl: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      ws.close();
      settle(false);
    }, timeoutMs);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      settle(true);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      settle(false);
    };
  });
}

export interface RelayAvailability {
  /** Whether the relay server responded to the probe */
  available: boolean;
  /** Whether the check is still in progress */
  isChecking: boolean;
}

/**
 * Probe the first configured relay server for reachability.
 *
 * Returns `available: true` if the server responds within the timeout,
 * `available: false` if unreachable or unconfigured.
 */
export function useRelayAvailability(): RelayAvailability {
  const [available, setAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkRelay() {
      let servers;
      try {
        servers = getRelayServers();
      } catch {
        if (!cancelled) {
          setAvailable(false);
          setIsChecking(false);
        }
        return;
      }

      const firstServer = servers[0];
      if (!firstServer) {
        if (!cancelled) {
          setAvailable(false);
          setIsChecking(false);
        }
        return;
      }

      const wsUrl = extractWsUrl(firstServer.multiaddr);
      if (!wsUrl) {
        logger.p2p.warn('Could not extract WS URL from relay multiaddr', {
          multiaddr: firstServer.multiaddr,
        });
        if (!cancelled) {
          setAvailable(false);
          setIsChecking(false);
        }
        return;
      }

      const reachable = await probeRelay(wsUrl, CHECK_TIMEOUT_MS);

      if (!cancelled) {
        if (reachable) {
          logger.p2p.info('P2P relay is running — P2P registration methods enabled', { wsUrl });
        } else {
          // NOTE: The browser logs "WebSocket connection failed" above — that's
          // the browser's native network error and can't be suppressed from JS.
          // This is expected when the relay server isn't running.
          logger.p2p.info(
            'P2P relay is not running — P2P registration methods disabled. ' +
              'Start the relay with `pnpm relay:dev` to enable P2P.',
            { wsUrl }
          );
        }
        setAvailable(reachable);
        setIsChecking(false);
      }
    }

    void checkRelay();
    return () => {
      cancelled = true;
    };
  }, []);

  return { available, isChecking };
}

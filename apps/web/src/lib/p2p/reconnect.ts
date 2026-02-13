/**
 * P2P reconnection utilities.
 *
 * Provides auto-reconnection to relay servers and peers
 * when connections are lost.
 */

import type { Libp2p, Connection } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

import { logger } from '@/lib/logger';
import { getRelayServers } from './types';
import { getPeerConnection } from './libp2p';

/** Default reconnection configuration */
const DEFAULT_CONFIG = {
  /** Maximum number of relay reconnection attempts */
  maxRelayRetries: 3,
  /** Initial delay between relay retries in ms */
  initialRelayDelayMs: 1000,
  /** Maximum delay between relay retries in ms */
  maxRelayDelayMs: 10000,
  /** Maximum number of peer reconnection attempts */
  maxPeerRetries: 3,
  /** Initial delay between peer retries in ms */
  initialPeerDelayMs: 500,
  /** Maximum delay between peer retries in ms */
  maxPeerDelayMs: 5000,
};

export interface ReconnectConfig {
  maxRelayRetries?: number;
  initialRelayDelayMs?: number;
  maxRelayDelayMs?: number;
  maxPeerRetries?: number;
  initialPeerDelayMs?: number;
  maxPeerDelayMs?: number;
}

export interface ReconnectResult {
  success: boolean;
  attempts: number;
  error?: string;
}

/**
 * Calculate exponential backoff delay with jitter.
 */
function getBackoffDelay(attempt: number, initial: number, max: number): number {
  const exponential = initial * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential; // 0-30% jitter
  return Math.min(exponential + jitter, max);
}

/**
 * Attempt to reconnect to relay servers.
 *
 * Tries each configured relay server in order with exponential backoff.
 * Returns true if successfully connected to at least one relay.
 *
 * @param libp2p - libp2p node instance
 * @param config - Reconnection configuration
 * @returns Result indicating success/failure and attempt count
 */
export async function reconnectToRelay(
  libp2p: Libp2p,
  config: ReconnectConfig = {}
): Promise<ReconnectResult> {
  const {
    maxRelayRetries = DEFAULT_CONFIG.maxRelayRetries,
    initialRelayDelayMs = DEFAULT_CONFIG.initialRelayDelayMs,
    maxRelayDelayMs = DEFAULT_CONFIG.maxRelayDelayMs,
  } = config;

  let relayServers;
  try {
    relayServers = getRelayServers();
  } catch (err) {
    logger.p2p.error('Cannot get relay servers for reconnection', {}, err as Error);
    return { success: false, attempts: 0, error: 'No relay servers configured' };
  }

  if (relayServers.length === 0) {
    return { success: false, attempts: 0, error: 'No relay servers available' };
  }

  let totalAttempts = 0;

  for (let attempt = 0; attempt < maxRelayRetries; attempt++) {
    for (const server of relayServers) {
      totalAttempts++;

      try {
        logger.p2p.info('Attempting relay reconnection', {
          relay: server.multiaddr,
          attempt: attempt + 1,
          maxRetries: maxRelayRetries,
        });

        const ma = multiaddr(server.multiaddr);
        await libp2p.dial(ma);

        logger.p2p.info('Successfully reconnected to relay', {
          relay: server.multiaddr,
          attempts: totalAttempts,
        });

        return { success: true, attempts: totalAttempts };
      } catch (err) {
        logger.p2p.warn('Relay reconnection attempt failed', {
          relay: server.multiaddr,
          attempt: attempt + 1,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Wait before next round of attempts (if not last attempt)
    if (attempt < maxRelayRetries - 1) {
      const delay = getBackoffDelay(attempt, initialRelayDelayMs, maxRelayDelayMs);
      logger.p2p.debug('Waiting before next relay reconnection attempt', { delayMs: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    attempts: totalAttempts,
    error: `Failed to reconnect after ${totalAttempts} attempts`,
  };
}

/**
 * Attempt to reconnect to a peer via circuit relay.
 *
 * First ensures relay connection is established, then dials the peer.
 *
 * @param libp2p - libp2p node instance
 * @param remotePeerId - Peer ID string to reconnect to
 * @param config - Reconnection configuration
 * @returns Connection if successful, null otherwise
 */
export async function reconnectToPeer(
  libp2p: Libp2p,
  remotePeerId: string,
  config: ReconnectConfig = {}
): Promise<{ connection: Connection | null; result: ReconnectResult }> {
  const {
    maxPeerRetries = DEFAULT_CONFIG.maxPeerRetries,
    initialPeerDelayMs = DEFAULT_CONFIG.initialPeerDelayMs,
    maxPeerDelayMs = DEFAULT_CONFIG.maxPeerDelayMs,
  } = config;

  // First, ensure we're connected to a relay
  const relayResult = await reconnectToRelay(libp2p, config);
  if (!relayResult.success) {
    return {
      connection: null,
      result: {
        success: false,
        attempts: relayResult.attempts,
        error: 'Cannot reconnect to peer: relay connection failed',
      },
    };
  }

  let totalAttempts = relayResult.attempts;

  for (let attempt = 0; attempt < maxPeerRetries; attempt++) {
    totalAttempts++;

    try {
      logger.p2p.info('Attempting peer reconnection via relay', {
        remotePeerId,
        attempt: attempt + 1,
        maxRetries: maxPeerRetries,
      });

      const connection = await getPeerConnection({ libp2p, remotePeerId });

      logger.p2p.info('Successfully reconnected to peer', {
        remotePeerId,
        attempts: totalAttempts,
      });

      return {
        connection,
        result: { success: true, attempts: totalAttempts },
      };
    } catch (err) {
      logger.p2p.warn('Peer reconnection attempt failed', {
        remotePeerId,
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : 'Unknown error',
      });

      // Wait before next attempt (if not last attempt)
      if (attempt < maxPeerRetries - 1) {
        const delay = getBackoffDelay(attempt, initialPeerDelayMs, maxPeerDelayMs);
        logger.p2p.debug('Waiting before next peer reconnection attempt', { delayMs: delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    connection: null,
    result: {
      success: false,
      attempts: totalAttempts,
      error: `Failed to reconnect to peer after ${totalAttempts - relayResult.attempts} peer dial attempts (${totalAttempts} total including relay)`,
    },
  };
}

/**
 * P2P type definitions for libp2p stream data.
 *
 * Re-exports from shared package, plus web-app-specific extensions.
 */

// Re-export all types and schemas from shared package
export {
  // Zod schemas
  SignatureOverTheWireSchema,
  FormStateOverTheWireSchema,
  RegistrationStateOverTheWireSchema,
  P2PStateOverTheWireSchema,
  ParsedStreamDataSchema,
  // TypeScript types
  type SignatureOverTheWire,
  type FormStateOverTheWire,
  type RegistrationStateOverTheWire,
  type P2PStateOverTheWire,
  type ParsedStreamData,
  // Configuration types
  type RelayConfig,
  RelayConfigurationError,
  // Validation utilities
  MAX_STREAM_SIZE_BYTES,
  DANGEROUS_JSON_KEYS,
  safeJsonParse,
  validateStreamData,
  isWithinSizeLimit,
  extractPeerIdFromMultiaddr,
  // Configuration
  RELAY_SERVERS,
  type EnvironmentConfig,
} from '@swr/p2p';

import { logger } from '@/lib/logger';
import {
  getRelayServers as baseGetRelayServers,
  extractPeerIdFromMultiaddr,
  type RelayConfig,
} from '@swr/p2p';

/**
 * Get relay servers for current Vite environment.
 *
 * This is a web-app-specific wrapper that reads from Vite environment variables.
 *
 * @throws {RelayConfigurationError} If production mode has no relay servers configured
 */
export function getRelayServers(): RelayConfig[] {
  return baseGetRelayServers({
    mode: import.meta.env.MODE || 'development',
    relayMultiaddr: import.meta.env.VITE_RELAY_MULTIADDR,
  });
}

/**
 * Get peer IDs of all known relay servers.
 * Useful for tagging connections in debug tools.
 * Returns empty set if relay servers are not configured.
 */
export function getRelayPeerIds(): Set<string> {
  const peerIds = new Set<string>();

  let servers: RelayConfig[];
  try {
    servers = getRelayServers();
  } catch (error) {
    // Log in development, return empty set if relay servers not configured
    if (import.meta.env.DEV) {
      logger.p2p.warn('Relay servers not configured', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return peerIds;
  }

  for (const server of servers) {
    const peerId = extractPeerIdFromMultiaddr(server.multiaddr);
    if (peerId) {
      peerIds.add(peerId);
    }
  }

  return peerIds;
}

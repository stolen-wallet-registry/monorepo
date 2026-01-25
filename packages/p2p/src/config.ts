/**
 * P2P relay server configuration.
 *
 * Environment-aware configuration for relay servers.
 * Web app uses this via getRelayServers(), relay server uses for self-identification.
 */

import type { Environment } from '@swr/chains';
import { RelayConfigurationError, type RelayConfig } from './types';
import { extractPeerIdFromMultiaddr } from './validation';

/**
 * Default relay servers by environment.
 *
 * IMPORTANT: Production relay servers MUST be configured before deployment.
 * The system will fail fast if production mode has no relay servers configured.
 */
export const RELAY_SERVERS: Record<Environment, RelayConfig[]> = {
  development: [
    {
      // Ed25519 peer ID format (12D3KooW... prefix) - libp2p 3.x standard
      //
      // SETUP: Run `pnpm relay:dev` once to generate stable keys.
      // The relay prints the multiaddr on startup - copy the peer ID here.
      // Keys are persisted in apps/relay/keys.json for consistent restarts.
      //
      // Alternative: Set VITE_RELAY_MULTIADDR env var to override this value.
      multiaddr:
        '/ip4/127.0.0.1/tcp/12312/ws/p2p/12D3KooWJCJbTjCCnCTGNSENuGK6Pu1aRqjLEJ4P7vEtFofpSXt7',
      isDev: true,
    },
  ],
  staging: [
    // TODO: Add staging relay server for testnet deployment
    // Configure via environment variable VITE_RELAY_MULTIADDR or add here:
    // { multiaddr: '/ip4/xxx.xxx.xxx.xxx/tcp/12312/ws/p2p/${PEER_ID}' },
  ],
  production: [
    // TODO: Add production relay server before deployment
    // Configure via environment variable VITE_RELAY_MULTIADDR or add here:
    // { multiaddr: '/ip4/167.172.223.225/tcp/12312/ws/p2p/${PEER_ID}' },
  ],
};

/**
 * Environment detection for relay server selection.
 * Can be overridden for server-side usage.
 */
export interface EnvironmentConfig {
  /** Current environment mode */
  mode: Environment;
  /** Optional multiaddr override from environment variable */
  relayMultiaddr?: string;
}

/**
 * Get relay servers for a given environment.
 *
 * @param config - Environment configuration
 * @returns Array of relay server configs
 * @throws {RelayConfigurationError} If production mode has no relay servers configured
 */
export function getRelayServers(config: EnvironmentConfig): RelayConfig[] {
  const { mode, relayMultiaddr } = config;

  // Check for environment variable override
  if (relayMultiaddr) {
    return [{ multiaddr: relayMultiaddr, isDev: mode !== 'production' }];
  }

  const servers = RELAY_SERVERS[mode];

  // Fail fast in production if no relay servers are configured
  if (mode === 'production' && (!servers || servers.length === 0)) {
    throw new RelayConfigurationError(
      'Production relay servers not configured. ' +
        'Set VITE_RELAY_MULTIADDR environment variable or add servers to RELAY_SERVERS.production. ' +
        'Cannot fall back to development relays in production mode.'
    );
  }

  // For non-production, fall back to development servers
  if (!servers || servers.length === 0) {
    if (mode !== 'development') {
      console.warn(`No relay servers configured for ${mode}; falling back to development relays.`);
    }
    return RELAY_SERVERS.development;
  }
  return servers;
}

/**
 * Get peer IDs of all configured relay servers.
 * Useful for tagging connections in debug tools.
 *
 * @param config - Environment configuration
 * @returns Set of peer IDs
 */
export function getRelayPeerIds(config: EnvironmentConfig): Set<string> {
  const peerIds = new Set<string>();

  let servers: RelayConfig[];
  try {
    servers = getRelayServers(config);
  } catch {
    // Return empty set if relay servers not configured
    return peerIds;
  }

  for (const server of servers) {
    const peerId = extractPeerIdFromMultiaddr(server.multiaddr);
    if (peerId) {
      peerIds.add(peerId);
    } else {
      // Warn about misconfigured multiaddr (useful for debugging in all environments)
      console.warn(`Could not extract peer ID from multiaddr: ${server.multiaddr}`);
    }
  }

  return peerIds;
}

/**
 * P2P type definitions for libp2p stream data.
 */

import type { P2PState } from '@/stores/p2pStore';

/**
 * Signature data transmitted over P2P streams.
 */
export interface SignatureOverTheWire {
  /** Signature key reference (AcknowledgementOfRegistry | Registration) */
  keyRef: string;
  /** Chain ID where signature is valid */
  chainId: number;
  /** Signer's Ethereum address */
  address: `0x${string}`;
  /** The signature value */
  value: string;
  /** Deadline as string (bigint serialized) */
  deadline: string;
  /** Nonce as string (bigint serialized) */
  nonce: string;
}

/**
 * Form state transmitted over P2P streams.
 */
export interface FormStateOverTheWire {
  /** Address being registered as stolen */
  registeree?: `0x${string}`;
  /** Address paying for registration */
  relayer?: `0x${string}`;
}

/**
 * Registration state transmitted over P2P streams.
 */
export interface RegistrationStateOverTheWire {
  /** Current registration step */
  currentStep?: string;
  /** Current registration method */
  currentMethod?: string;
}

/**
 * Data structure for P2P stream messages.
 *
 * Used for communication between registeree and relayer peers.
 */
export interface ParsedStreamData {
  /** Whether the operation succeeded */
  success?: boolean;
  /** Human-readable message */
  message?: string;
  /** P2P connection state */
  p2p?: Partial<P2PState>;
  /** Form values */
  form?: FormStateOverTheWire;
  /** Registration flow state */
  state?: RegistrationStateOverTheWire;
  /** Signature data for relay */
  signature?: SignatureOverTheWire;
  /** Transaction hash after submission */
  hash?: `0x${string}`;
}

/**
 * Relay server configuration.
 */
export interface RelayConfig {
  /** Multiaddr of the relay server */
  multiaddr: string;
  /** Whether this is a development relay */
  isDev?: boolean;
}

/**
 * Extract peer ID from a multiaddr string.
 * Returns the peer ID portion after /p2p/ or null if not found.
 */
export function extractPeerIdFromMultiaddr(multiaddr: string): string | null {
  const match = multiaddr.match(/\/p2p\/([^/]+)$/);
  return match ? match[1] : null;
}

/**
 * Get peer IDs of all known relay servers.
 * Useful for tagging connections in debug tools.
 */
export function getRelayPeerIds(): Set<string> {
  const peerIds = new Set<string>();
  const servers = getRelayServers();

  for (const server of servers) {
    const peerId = extractPeerIdFromMultiaddr(server.multiaddr);
    if (peerId) {
      peerIds.add(peerId);
    }
  }

  return peerIds;
}

/**
 * Default relay servers by environment.
 *
 * IMPORTANT: Production relay servers MUST be configured before deployment.
 * The system will fail fast if production mode has no relay servers configured.
 */
export const RELAY_SERVERS: Record<string, RelayConfig[]> = {
  development: [
    {
      // Note: Use VITE_RELAY_MULTIADDR env var to override if relay peer ID changes
      // The peer ID uses Ed25519 key format (12D3KooW... prefix)
      multiaddr:
        '/ip4/127.0.0.1/tcp/12312/ws/p2p/12D3KooWFSaPwwQYj7GTdHduUiHGPygkiEudkodcVdJJvzwr1xq8',
      isDev: true,
    },
  ],
  production: [
    // TODO: Add production relay server before deployment
    // Configure via environment variable VITE_RELAY_MULTIADDR or add here:
    // { multiaddr: '/ip4/167.172.223.225/tcp/12312/ws/p2p/${PEER_ID}' },
  ],
};

/**
 * Error thrown when relay server configuration is missing.
 */
export class RelayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelayConfigurationError';
  }
}

/**
 * Get relay servers for current environment.
 *
 * @throws {RelayConfigurationError} If production mode has no relay servers configured
 */
export function getRelayServers(): RelayConfig[] {
  const env = import.meta.env.MODE || 'development';

  // Check for environment variable override
  const envRelay = import.meta.env.VITE_RELAY_MULTIADDR;
  if (envRelay) {
    return [{ multiaddr: envRelay, isDev: false }];
  }

  const servers = RELAY_SERVERS[env];

  // Fail fast in production if no relay servers are configured
  if (env === 'production' && (!servers || servers.length === 0)) {
    throw new RelayConfigurationError(
      'Production relay servers not configured. ' +
        'Set VITE_RELAY_MULTIADDR environment variable or add servers to RELAY_SERVERS.production. ' +
        'Cannot fall back to development relays in production mode.'
    );
  }

  // For non-production, fall back to development servers
  return servers && servers.length > 0 ? servers : RELAY_SERVERS.development;
}

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
 * Default relay servers by environment.
 */
export const RELAY_SERVERS: Record<string, RelayConfig[]> = {
  development: [
    {
      multiaddr:
        '/ip4/127.0.0.1/tcp/12312/ws/p2p/12D3KooWNucVJrR4PKToXbVK9xxTRSUFYV7C28TYqCN26CofJN7F',
      isDev: true,
    },
  ],
  production: [
    // TODO: Add production relay server
    // { multiaddr: '/ip4/167.172.223.225/tcp/12312/ws/p2p/${PEER_ID}' },
  ],
};

/**
 * Get relay servers for current environment.
 */
export function getRelayServers(): RelayConfig[] {
  const env = import.meta.env.MODE || 'development';
  return RELAY_SERVERS[env] || RELAY_SERVERS.development;
}

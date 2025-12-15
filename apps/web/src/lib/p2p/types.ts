/**
 * P2P type definitions for libp2p stream data.
 */

import { z } from 'zod';
import type { P2PState } from '@/stores/p2pStore';

// ============================================================================
// Zod Schemas for P2P Stream Data Validation
// ============================================================================

/** Ethereum address regex - 0x followed by 40 hex characters */
const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

/** Transaction hash regex - 0x followed by 64 hex characters */
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

/** Signature over the wire schema */
export const SignatureOverTheWireSchema = z
  .object({
    keyRef: z.string().max(100),
    chainId: z.number().int().positive(),
    address: ethereumAddressSchema,
    value: z.string().max(500), // Signatures are ~130 chars
    deadline: z.string().max(50), // BigInt as string
    nonce: z.string().max(50), // BigInt as string
  })
  .strict();

/** Form state over the wire schema */
export const FormStateOverTheWireSchema = z
  .object({
    registeree: ethereumAddressSchema.optional(),
    relayer: ethereumAddressSchema.optional(),
  })
  .strict();

/** Registration state over the wire schema */
export const RegistrationStateOverTheWireSchema = z
  .object({
    currentStep: z.string().max(50).optional(),
    currentMethod: z.string().max(50).optional(),
  })
  .strict();

/** P2P state subset schema (only allow safe fields) */
export const P2PStateOverTheWireSchema = z
  .object({
    peerId: z.string().max(100).optional(),
    partnerPeerId: z.string().max(100).optional(),
    connectedToPeer: z.boolean().optional(),
  })
  .strict();

/** Main parsed stream data schema */
export const ParsedStreamDataSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
    p2p: P2PStateOverTheWireSchema.optional(),
    form: FormStateOverTheWireSchema.optional(),
    state: RegistrationStateOverTheWireSchema.optional(),
    signature: SignatureOverTheWireSchema.optional(),
    hash: txHashSchema.optional(),
  })
  .strict(); // Reject unknown keys for security

// ============================================================================
// Stream Data Size Limits
// ============================================================================

/** Maximum size of incoming P2P stream data (100KB) */
export const MAX_STREAM_SIZE_BYTES = 100 * 1024;

/**
 * Dangerous JSON keys that could enable prototype pollution attacks.
 * These are stripped during parsing.
 */
export const DANGEROUS_JSON_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Safe JSON parse that strips dangerous keys to prevent prototype pollution.
 */
export function safeJsonParse(jsonString: string): unknown {
  return JSON.parse(jsonString, (key, value) => {
    if (DANGEROUS_JSON_KEYS.includes(key)) {
      return undefined;
    }
    return value;
  });
}

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
 * Returns empty set if relay servers are not configured (e.g., production without config).
 */
export function getRelayPeerIds(): Set<string> {
  const peerIds = new Set<string>();

  let servers: ReturnType<typeof getRelayServers>;
  try {
    servers = getRelayServers();
  } catch {
    // Return empty set if relay servers not configured (e.g., unconfigured production)
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
      // TODO: Generate persistent Ed25519 keys for relay server - current keys.json uses RSA format
      multiaddr:
        '/ip4/127.0.0.1/tcp/12312/ws/p2p/12D3KooWKiDztC8EkavAWNratG2nRPmv4DGa2tEr3p9xrLVgvTG5',
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

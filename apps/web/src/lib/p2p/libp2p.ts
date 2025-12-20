/**
 * libp2p configuration for P2P relay functionality.
 *
 * Uses libp2p 3.x with yamux stream muxer, WebRTC, WebSockets, and WebTransport.
 */

import { createLibp2p, type Libp2p, type Libp2pOptions } from 'libp2p';
import type { StreamHandlerRecord, Connection, Stream, StreamHandler } from '@libp2p/interface';

import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webRTC, webRTCDirect } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';

import * as lp from 'it-length-prefixed';
import { peerIdFromString } from '@libp2p/peer-id';
import { WebRTC } from '@multiformats/multiaddr-matcher';

import { logger } from '@/lib/logger';
import { useP2PStore } from '@/stores/p2pStore';
import {
  getRelayServers,
  type ParsedStreamData,
  MAX_STREAM_SIZE_BYTES,
  safeJsonParse,
  ParsedStreamDataSchema,
} from './types';
import { getOrCreatePeerId } from './peerId';

/**
 * Private/localhost address patterns to block in production.
 * Patterns must start with '/' for startsWith matching.
 * Covers RFC1918, RFC3927, RFC4193, and localhost ranges.
 */
const PRIVATE_ADDRESS_PATTERNS = [
  '/ip4/127.', // Localhost IPv4 (127.0.0.0/8)
  '/ip4/0.0.0.0', // Unspecified address
  '/ip4/10.', // RFC1918: 10.0.0.0/8
  '/ip4/192.168.', // RFC1918: 192.168.0.0/16
  '/ip4/169.254.', // RFC3927: IPv4 link-local (169.254.0.0/16)
  '/ip6/::1', // Localhost IPv6
  '/ip6/fc', // RFC4193: IPv6 ULA (fc00::/7 covers fc00::-fdff::)
  '/ip6/fd', // RFC4193: IPv6 ULA (fd00::/8, more common ULA prefix)
  '/ip6/fe80', // IPv6 link-local (fe80::/10)
] as const;

/**
 * Check if an address is in the 172.16.0.0/12 private range (172.16.x.x - 172.31.x.x).
 */
function isPrivate172Range(addr: string): boolean {
  const match = addr.match(/\/ip4\/172\.(\d+)\./);
  if (!match) return false;
  const secondOctet = parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

/**
 * Check if a multiaddr points to a private/localhost address.
 * Uses startsWith to avoid false positives from protocol tokens appearing mid-address.
 */
function isPrivateAddress(addr: string): boolean {
  return (
    PRIVATE_ADDRESS_PATTERNS.some((pattern) => addr.startsWith(pattern)) || isPrivate172Range(addr)
  );
}

/**
 * Protocol handler configuration.
 */
export interface ProtocolHandler {
  protocol: string;
  streamHandler: StreamHandlerRecord;
}

/**
 * Get default libp2p configuration for browser clients.
 */
export function libp2pDefaults(): Libp2pOptions {
  const relayServers = getRelayServers();
  const bootstrapList = relayServers.map((r) => r.multiaddr);

  return {
    addresses: {
      listen: ['/p2p-circuit', '/webrtc'],
    },
    transports: [
      circuitRelayTransport({
        // Give more time for slow connections during relay reservation (default is 10s)
        reservationCompletionTimeout: 15_000,
      }),
      webRTC(),
      webRTCDirect(),
      webTransport(),
      webSockets(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: bootstrapList.length > 0 ? [bootstrap({ list: bootstrapList })] : [],
    connectionGater: {
      denyDialMultiaddr: (ma) => {
        // In production, block localhost/private network connections
        if (import.meta.env.PROD) {
          return isPrivateAddress(ma.toString());
        }
        return false; // Allow all dials in development
      },
    },
    services: {
      identify: identify(),
      dcutr: dcutr(),
      ping: ping(),
    },
  };
}

export interface SetupOptions {
  /** Protocol handlers to register */
  handlers: ProtocolHandler[];
  /** Wallet address for persistent peer ID (optional - if not provided, random ID is generated) */
  walletAddress?: string;
}

/**
 * Create and start a libp2p node with protocol handlers.
 *
 * If walletAddress is provided, a persistent peer ID will be used (same wallet + browser = same ID).
 * Otherwise, a random peer ID is generated each time.
 *
 * @param options - Setup options including handlers and optional wallet address
 * @returns Started libp2p node
 */
export async function setup(options: SetupOptions): Promise<{ libp2p: Libp2p }>;
/**
 * @deprecated Use setup({ handlers, walletAddress }) instead
 */
export async function setup(handlers: ProtocolHandler[]): Promise<{ libp2p: Libp2p }>;
export async function setup(
  optionsOrHandlers: SetupOptions | ProtocolHandler[]
): Promise<{ libp2p: Libp2p }> {
  // Handle both old array-style and new options-style calls
  const { handlers, walletAddress } = Array.isArray(optionsOrHandlers)
    ? { handlers: optionsOrHandlers, walletAddress: undefined }
    : optionsOrHandlers;

  logger.p2p.info('Creating libp2p node', { persistentId: !!walletAddress });

  // Get persistent private key if wallet address provided
  const config = libp2pDefaults();
  if (walletAddress) {
    const { privateKey } = await getOrCreatePeerId(walletAddress);
    // Type assertion: Libp2pOptions doesn't include privateKey in its type,
    // but createLibp2p() accepts it for custom identity
    (config as { privateKey?: unknown }).privateKey = privateKey;
  }

  const libp2p = await createLibp2p(config);

  for (const h of handlers) {
    const { protocol, streamHandler } = h;
    logger.p2p.debug('Registering protocol handler', { protocol });
    // In libp2p 3.x, StreamHandler signature is (stream, connection) => void
    await libp2p.handle(protocol, streamHandler.handler, streamHandler.options);
  }

  logger.p2p.info('libp2p node created', {
    peerId: libp2p.peerId.toString(),
    multiaddrs: libp2p.getMultiaddrs().map((ma) => ma.toString()),
    persistent: !!walletAddress,
  });

  return { libp2p };
}

/**
 * Get an existing connection to a peer or establish a new one via circuit relay.
 *
 * @param libp2p - libp2p node instance
 * @param remotePeerId - Peer ID string to connect to
 * @returns Connection to the remote peer
 */
export const getPeerConnection = async ({
  libp2p,
  remotePeerId,
}: {
  libp2p: Libp2p;
  remotePeerId: string;
}): Promise<Connection> => {
  logger.p2p.debug('Getting peer connection', { remotePeerId });

  // Parse the remote peer ID for comparison
  const peerId = peerIdFromString(remotePeerId);

  // Check for existing connection using proper PeerId comparison
  let connection = libp2p.getConnections().find((conn) => conn.remotePeer.equals(peerId));

  if (connection) {
    logger.p2p.debug('Using existing connection', { remotePeerId });
    return connection;
  }

  // Create new connection via circuit relay
  const multiaddrs = libp2p.getMultiaddrs().map((ma) => {
    // Code 290 is the p2p-circuit protocol code.
    //
    // Type workaround: @multiformats/multiaddr-matcher 1.6.x WebRTC.matches() expects
    // Multiaddr from @multiformats/multiaddr 12.x, but libp2p 3.x uses @multiformats/multiaddr 13.x.
    // The runtime behavior is compatible, only the type signatures differ.
    // Track: https://github.com/multiformats/js-multiaddr-matcher/issues
    // TODO: Remove cast when multiaddr-matcher updates to support multiaddr 13.x
    if (WebRTC.matches(ma as Parameters<typeof WebRTC.matches>[0])) {
      return ma.decapsulateCode(290).encapsulate(`/p2p-circuit/webrtc/p2p/${peerId.toString()}`);
    } else {
      return ma.decapsulateCode(290).encapsulate(`/p2p-circuit/p2p/${peerId.toString()}`);
    }
  });

  await libp2p.peerStore.save(peerId, { multiaddrs });
  connection = await libp2p.dial(multiaddrs);

  logger.p2p.info('Established new peer connection', {
    remotePeerId,
    remoteAddr: connection.remoteAddr.toString(),
  });

  return connection;
};

/**
 * Send data to a peer over a specific protocol.
 *
 * @param streamData - Data to send (will be JSON stringified)
 * @param connection - Active connection to the peer
 * @param protocols - Protocol(s) to use for the stream
 */
export const passStreamData = async ({
  streamData = {},
  connection,
  protocols,
}: {
  streamData?: ParsedStreamData;
  connection: Connection;
  protocols: string[];
}): Promise<void> => {
  logger.p2p.debug('Sending stream data', {
    protocols,
    remotePeer: connection.remotePeer.toString(),
  });

  try {
    // Circuit relay connections are "limited" - must explicitly allow streams on them
    const stream = await connection.newStream(protocols, { runOnLimitedConnection: true });
    const data = uint8ArrayFromString(JSON.stringify(streamData));

    // In libp2p 3.x, use lp.encode.single to encode a single message with length prefix
    const encoded = lp.encode.single(data);
    stream.send(encoded.subarray());

    await stream.close();
    logger.p2p.debug('Stream data sent successfully');

    // Successful message proves connection is alive - update store
    // This overrides health check ping failures since we just communicated
    logger.p2p.debug('Marking peer as connected (message sent successfully)');
    useP2PStore.getState().setConnectedToPeer(true);
  } catch (error) {
    logger.p2p.error('Failed to send stream data', { protocols }, error as Error);
    throw error;
  }
};

/**
 * Error thrown when stream data validation fails.
 */
export class StreamDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamDataValidationError';
  }
}

/**
 * Read and validate data from an incoming stream.
 *
 * Security features:
 * - Size limit to prevent DoS (100KB max)
 * - Safe JSON parsing to prevent prototype pollution
 * - Zod schema validation to reject malformed/malicious data
 *
 * @param stream - Incoming stream
 * @returns Validated parsed stream data
 * @throws {StreamDataValidationError} If data exceeds size limit or fails validation
 */
export const readStreamData = async (stream: Stream): Promise<ParsedStreamData> => {
  logger.p2p.debug('Reading stream data');

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  // In libp2p 3.x, Stream is AsyncIterable<Uint8Array | Uint8ArrayList>
  // Pass stream directly to lp.decode
  for await (const chunk of lp.decode(stream)) {
    // chunk is Uint8ArrayList in 3.x, get as Uint8Array
    const bytes = chunk instanceof Uint8Array ? chunk : chunk.subarray();

    // Check size limit to prevent DoS attacks
    totalSize += bytes.length;
    if (totalSize > MAX_STREAM_SIZE_BYTES) {
      logger.p2p.warn('Stream data exceeds size limit', {
        size: totalSize,
        limit: MAX_STREAM_SIZE_BYTES,
      });
      throw new StreamDataValidationError(
        `Stream data exceeds maximum size limit of ${MAX_STREAM_SIZE_BYTES} bytes`
      );
    }

    chunks.push(bytes);
  }

  // Concatenate all chunks
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const jsonString = uint8ArrayToString(combined);

  // Safe JSON parse to prevent prototype pollution
  let rawData: unknown;
  try {
    rawData = safeJsonParse(jsonString);
  } catch (error) {
    logger.p2p.warn('Failed to parse stream JSON', { error });
    throw new StreamDataValidationError('Invalid JSON in stream data');
  }

  // Validate with Zod schema
  const parseResult = ParsedStreamDataSchema.safeParse(rawData);
  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    logger.p2p.warn('Stream data validation failed', {
      errors: issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    });
    throw new StreamDataValidationError(
      `Stream data validation failed: ${issues.map((e) => e.message).join(', ')}`
    );
  }

  const data = parseResult.data as ParsedStreamData;
  logger.p2p.debug('Stream data received and validated', {
    success: data.success,
    message: data.message,
  });

  // Successful receive proves connection is alive - update store
  logger.p2p.debug('Marking peer as connected (message received successfully)');
  useP2PStore.getState().setConnectedToPeer(true);

  return data;
};

// Re-export types for convenience
export type { Libp2p, Connection, Stream, StreamHandler };
export type { ParsedStreamData };

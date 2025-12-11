/**
 * libp2p configuration for P2P relay functionality.
 *
 * Based on libp2p 0.46.x - will be upgraded to 2.x during WebRTC/WebTransport phase.
 */

import { createLibp2p, type Libp2p } from 'libp2p';
import type { StreamHandlerRecord } from '@libp2p/interface/stream-handler';
import type { Connection } from '@libp2p/interface/connection';

import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';

import { gossipsub, type GossipsubEvents } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { type DualKadDHT, kadDHT } from '@libp2p/kad-dht';
import { mplex } from '@libp2p/mplex';
import { webRTC, webRTCDirect } from '@libp2p/webrtc';
import * as filters from '@libp2p/websockets/filters';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { ipnsSelector } from 'ipns/selector';
import { ipnsValidator } from 'ipns/validator';
import { autoNATService } from 'libp2p/autonat';
import { circuitRelayTransport } from 'libp2p/circuit-relay';
import { dcutrService } from 'libp2p/dcutr';
import { type IdentifyService, identifyService } from 'libp2p/identify';
import { pingService, type PingService } from 'libp2p/ping';
import type { PubSub } from '@libp2p/interface/pubsub';
import type { Libp2pOptions } from 'libp2p';

import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { peerIdFromString } from '@libp2p/peer-id';
import { WebRTC } from '@multiformats/multiaddr-matcher';

import { logger } from '@/lib/logger';
import { getRelayServers, type ParsedStreamData } from './types';

/**
 * libp2p services interface for typed access.
 */
export interface DefaultLibp2pServices extends Record<string, unknown> {
  dht: DualKadDHT;
  delegatedRouting: unknown;
  pubsub: PubSub<GossipsubEvents>;
  identify: IdentifyService;
  autoNAT: unknown;
  dcutr: unknown;
  ping: PingService;
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
export function libp2pDefaults(): Libp2pOptions<DefaultLibp2pServices> {
  const relayServers = getRelayServers();
  const bootstrapList = relayServers.map((r) => r.multiaddr);

  return {
    addresses: {
      listen: ['/webrtc'],
    },
    transports: [
      circuitRelayTransport({
        discoverRelays: 10,
      }),
      webRTC(),
      webRTCDirect(),
      webTransport(),
      webSockets({
        filter: filters.all,
      }),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [mplex(), yamux()],
    peerDiscovery: bootstrapList.length > 0 ? [bootstrap({ list: bootstrapList })] : [],
    connectionGater: {
      denyDialMultiaddr: () => {
        // Allow local addresses in development for testing
        return import.meta.env.MODE !== 'development';
      },
    },
    services: {
      identify: identifyService(),
      autoNAT: autoNATService(),
      pubsub: gossipsub() as (components: unknown) => PubSub<GossipsubEvents>,
      dcutr: dcutrService(),
      dht: kadDHT({
        clientMode: true,
        validators: {
          ipns: ipnsValidator,
        },
        selectors: {
          ipns: ipnsSelector,
        },
      }) as (components: unknown) => DualKadDHT,
      ping: pingService(),
    },
  };
}

/**
 * Create and start a libp2p node with protocol handlers.
 *
 * @param handlers - Protocol handlers to register
 * @returns Started libp2p node
 */
export async function setup(handlers: ProtocolHandler[]): Promise<{ libp2p: Libp2p }> {
  logger.p2p.info('Creating libp2p node');

  const libp2p = await createLibp2p(libp2pDefaults());

  for (const h of handlers) {
    const { protocol, streamHandler } = h;
    logger.p2p.debug('Registering protocol handler', { protocol });
    libp2p.handle(protocol, streamHandler.handler);
  }

  logger.p2p.info('libp2p node created', {
    peerId: libp2p.peerId.toString(),
    multiaddrs: libp2p.getMultiaddrs().map((ma) => ma.toString()),
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

  // Check for existing connection
  let connection = libp2p.getConnections().find((conn) => conn.remotePeer.equals(remotePeerId));

  if (connection) {
    logger.p2p.debug('Using existing connection', { remotePeerId });
    return connection;
  }

  // Create new connection via circuit relay
  const peerId = peerIdFromString(remotePeerId);

  const multiaddrs = libp2p.getMultiaddrs().map((ma) => {
    // code 290 is the p2p-circuit code
    if (WebRTC.matches(ma)) {
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
    const stream = await connection.newStream(protocols);

    await pipe(
      JSON.stringify(streamData),
      (source) => map(source, (string) => uint8ArrayFromString(string)),
      (source) => lp.encode(source),
      stream.sink
    );

    await stream.close();
    logger.p2p.debug('Stream data sent successfully');
  } catch (error) {
    logger.p2p.error('Failed to send stream data', { protocols }, error as Error);
    throw error;
  }
};

/**
 * Read data from an incoming stream.
 *
 * @param source - Incoming stream source (from IncomingStreamData.stream.source)
 * @returns Parsed stream data
 */
export const readStreamData = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: any
): Promise<ParsedStreamData> => {
  logger.p2p.debug('Reading stream data');

  const chunks: string[] = [];

  await pipe(
    source,
    (source: AsyncIterable<Uint8Array>) => lp.decode(source),
    async (decoded: AsyncIterable<{ subarray: () => Uint8Array }>) => {
      for await (const chunk of decoded) {
        chunks.push(uint8ArrayToString(chunk.subarray()));
      }
    }
  );

  const jsonString = chunks.join('');
  const data = JSON.parse(jsonString) as ParsedStreamData;

  logger.p2p.debug('Stream data received', { success: data.success, message: data.message });

  return data;
};

// Re-export types for convenience
export type { Libp2p, Connection };
export type { ParsedStreamData };

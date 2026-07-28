/**
 * Plain-data snapshot of a libp2p node, plus the extractors that produce it.
 *
 * Kept out of the React tree deliberately: libp2p objects are Proxies that throw on
 * unknown property access, so everything the panel renders is flattened into these
 * serializable shapes first.
 */

import type { Libp2p } from 'libp2p';
import type { Connection } from '@libp2p/interface';

export interface ConnectionInfo {
  id: string;
  remoteAddr: string;
  remotePeer: string;
  direction: 'inbound' | 'outbound';
  multiplexer?: string;
  encryption?: string;
  status: string;
  /** Whether this connection is to a known relay server */
  isRelay: boolean;
  streams: {
    id: string;
    protocol?: string;
    direction: string;
    status: string;
  }[];
}

export interface DebugInfo {
  peerId: string | null;
  multiaddrs: string[];
  protocols: string[];
  connections: ConnectionInfo[];
}

/**
 * Extract connection info from a libp2p Connection object.
 * @param conn - The connection to extract info from
 * @param relayPeerIds - Set of known relay peer IDs for tagging
 */
export function extractConnectionInfo(conn: Connection, relayPeerIds: Set<string>): ConnectionInfo {
  const remotePeerId = conn.remotePeer.toString();

  return {
    id: conn.id,
    remoteAddr: conn.remoteAddr.toString(),
    remotePeer: remotePeerId,
    direction: conn.direction,
    multiplexer: conn.multiplexer,
    encryption: conn.encryption,
    status: conn.status,
    isRelay: relayPeerIds.has(remotePeerId),
    streams: conn.streams.map((stream) => ({
      id: stream.id,
      protocol: stream.protocol,
      direction: stream.direction,
      status: stream.status,
    })),
  };
}

/**
 * Extract debug info from libp2p node.
 * Safely handles node being null or shutting down.
 * @param libp2p - The libp2p node (or null)
 * @param relayPeerIds - Set of known relay peer IDs for tagging connections
 */
export function extractDebugInfo(libp2p: Libp2p | null, relayPeerIds: Set<string>): DebugInfo {
  if (!libp2p) {
    return {
      peerId: null,
      multiaddrs: [],
      protocols: [],
      connections: [],
    };
  }

  try {
    return {
      peerId: libp2p.peerId.toString(),
      multiaddrs: libp2p.getMultiaddrs().map((ma) => ma.toString()),
      protocols: libp2p.getProtocols(),
      connections: libp2p.getConnections().map((c) => extractConnectionInfo(c, relayPeerIds)),
    };
  } catch {
    // Node may be shutting down
    return {
      peerId: null,
      multiaddrs: [],
      protocols: [],
      connections: [],
    };
  }
}

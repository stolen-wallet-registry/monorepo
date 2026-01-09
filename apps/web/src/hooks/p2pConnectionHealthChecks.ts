import type { Connection, Libp2p } from '@libp2p/interface';
import type { Ping } from '@libp2p/ping';
import { peerIdFromString } from '@libp2p/peer-id';

import { logger } from '@/lib/logger';

export interface ConnectionCheckResult {
  connected: boolean;
  latency: number | null;
}

export function checkRelayConnection(
  connections: Connection[],
  relayPeerIds: string[]
): ConnectionCheckResult {
  if (!relayPeerIds.length) {
    return { connected: false, latency: null };
  }

  // Check if we have an open connection to any relay
  const relayConnection = connections.find((conn) =>
    relayPeerIds.some((relayId) => conn.remotePeer.toString() === relayId)
  );

  if (relayConnection && relayConnection.status === 'open') {
    return { connected: true, latency: null };
  }

  return { connected: false, latency: null };
}

export async function checkPeerConnection(
  node: Libp2p,
  peerId: string
): Promise<ConnectionCheckResult> {
  try {
    const parsedPeerId = peerIdFromString(peerId);
    const pingService = (node.services as { ping?: Ping }).ping;

    if (!pingService) {
      logger.p2p.warn('Ping service not available for health check');
      return { connected: false, latency: null };
    }

    const startTime = performance.now();
    await pingService.ping(parsedPeerId);
    const latency = Math.round(performance.now() - startTime);

    return { connected: true, latency };
  } catch {
    return { connected: false, latency: null };
  }
}

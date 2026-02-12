import type { ConnectionHealth, ConnectionStatus } from './useP2PConnectionHealth';
import type { ConnectionCheckResult } from './p2pConnectionHealthChecks';

export interface HealthCheckInput {
  prev: ConnectionHealth;
  relay: ConnectionCheckResult;
  peer: ConnectionCheckResult;
  storeConnectedToPeer: boolean;
  hasRemotePeer: boolean;
  now: number;
  maxFailuresBeforeDisconnect: number;
  degradedLatencyMs: number;
}

export interface HealthCheckOutput {
  next: ConnectionHealth;
  relayDisconnected: boolean;
  peerDisconnected: boolean;
  resetRelayDisconnectedFlag: boolean;
  resetPeerDisconnectedFlag: boolean;
}

export function computeConnectionStatus({
  relayConnected,
  peerConnected,
  relayLatency,
  peerLatency,
  hasRemotePeer,
  degradedLatencyMs,
}: {
  relayConnected: boolean;
  peerConnected: boolean;
  relayLatency: number | null;
  peerLatency: number | null;
  hasRemotePeer: boolean;
  degradedLatencyMs: number;
}): ConnectionStatus {
  // Disconnected if relay is down (can't communicate at all)
  if (!relayConnected) {
    return 'disconnected';
  }

  // If we're supposed to have a peer, check peer status
  if (hasRemotePeer) {
    if (!peerConnected) {
      return 'disconnected';
    }

    // Check for high latency (degraded)
    if (peerLatency !== null && peerLatency > degradedLatencyMs) {
      return 'degraded';
    }
  }

  // Check relay latency
  if (relayLatency !== null && relayLatency > degradedLatencyMs) {
    return 'degraded';
  }

  return 'healthy';
}

export function computeHealthUpdate({
  prev,
  relay,
  peer,
  storeConnectedToPeer,
  hasRemotePeer,
  now,
  maxFailuresBeforeDisconnect,
  degradedLatencyMs,
}: HealthCheckInput): HealthCheckOutput {
  // Store says connected if we recently sent/received data successfully.
  // This overrides ping failures since actual message passing proves connectivity.
  // If peer is connected via message pass, relay must also be working since
  // circuit relay routes all messages through the relay server.
  const effectiveRelayConnected = relay.connected || storeConnectedToPeer;
  const effectivePeerConnected = peer.connected || storeConnectedToPeer;

  const newRelayFailures = effectiveRelayConnected ? 0 : prev.relayFailures + 1;
  // Always track ping failures - we need to detect disconnect even if store says connected.
  const newPeerFailures = peer.connected ? 0 : prev.peerFailures + 1;

  const relayDisconnected = newRelayFailures >= maxFailuresBeforeDisconnect;
  const peerDisconnected = hasRemotePeer && newPeerFailures >= maxFailuresBeforeDisconnect;

  const status = computeConnectionStatus({
    relayConnected: effectiveRelayConnected,
    peerConnected: effectivePeerConnected,
    relayLatency: relay.latency,
    peerLatency: peer.latency,
    hasRemotePeer,
    degradedLatencyMs,
  });

  return {
    next: {
      relayConnected: effectiveRelayConnected,
      peerConnected: effectivePeerConnected,
      lastRelayPing: relay.latency,
      lastPeerPing: peer.latency,
      status,
      relayFailures: newRelayFailures,
      peerFailures: newPeerFailures,
      lastCheckAt: now,
    },
    relayDisconnected,
    peerDisconnected,
    resetRelayDisconnectedFlag: effectiveRelayConnected,
    resetPeerDisconnectedFlag: effectivePeerConnected,
  };
}

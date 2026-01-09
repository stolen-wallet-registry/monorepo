import { describe, it, expect } from 'vitest';

import { computeConnectionStatus, computeHealthUpdate } from '@/hooks/p2pConnectionHealthState';
import type { ConnectionHealth } from '@/hooks/useP2PConnectionHealth';

const baseHealth: ConnectionHealth = {
  relayConnected: false,
  peerConnected: false,
  lastRelayPing: null,
  lastPeerPing: null,
  status: 'unknown',
  relayFailures: 0,
  peerFailures: 0,
  lastCheckAt: null,
};

describe('p2pConnectionHealthState', () => {
  describe('computeConnectionStatus', () => {
    it('returns disconnected when relay is down', () => {
      const status = computeConnectionStatus({
        relayConnected: false,
        peerConnected: true,
        relayLatency: null,
        peerLatency: null,
        hasRemotePeer: true,
        degradedLatencyMs: 3000,
      });

      expect(status).toBe('disconnected');
    });

    it('returns disconnected when peer is down and remote peer is expected', () => {
      const status = computeConnectionStatus({
        relayConnected: true,
        peerConnected: false,
        relayLatency: null,
        peerLatency: null,
        hasRemotePeer: true,
        degradedLatencyMs: 3000,
      });

      expect(status).toBe('disconnected');
    });

    it('returns degraded when peer latency is high', () => {
      const status = computeConnectionStatus({
        relayConnected: true,
        peerConnected: true,
        relayLatency: 10,
        peerLatency: 5000,
        hasRemotePeer: true,
        degradedLatencyMs: 3000,
      });

      expect(status).toBe('degraded');
    });

    it('returns degraded when relay latency is high', () => {
      const status = computeConnectionStatus({
        relayConnected: true,
        peerConnected: true,
        relayLatency: 5001,
        peerLatency: 100,
        hasRemotePeer: false,
        degradedLatencyMs: 3000,
      });

      expect(status).toBe('degraded');
    });

    it('returns healthy for connected low-latency state', () => {
      const status = computeConnectionStatus({
        relayConnected: true,
        peerConnected: true,
        relayLatency: 100,
        peerLatency: 150,
        hasRemotePeer: true,
        degradedLatencyMs: 3000,
      });

      expect(status).toBe('healthy');
    });
  });

  describe('computeHealthUpdate', () => {
    it('marks peer disconnected after consecutive failures', () => {
      const result = computeHealthUpdate({
        prev: { ...baseHealth, peerFailures: 1, relayFailures: 0 },
        relay: { connected: true, latency: null },
        peer: { connected: false, latency: null },
        storeConnectedToPeer: false,
        hasRemotePeer: true,
        now: 1234,
        maxFailuresBeforeDisconnect: 2,
        degradedLatencyMs: 3000,
      });

      expect(result.peerDisconnected).toBe(true);
      expect(result.next.peerFailures).toBe(2);
      expect(result.next.lastCheckAt).toBe(1234);
    });

    it('resets relay failures when store shows connection', () => {
      const result = computeHealthUpdate({
        prev: { ...baseHealth, relayFailures: 2 },
        relay: { connected: false, latency: null },
        peer: { connected: false, latency: null },
        storeConnectedToPeer: true,
        hasRemotePeer: false,
        now: 1234,
        maxFailuresBeforeDisconnect: 2,
        degradedLatencyMs: 3000,
      });

      expect(result.next.relayConnected).toBe(true);
      expect(result.next.relayFailures).toBe(0);
      expect(result.resetRelayDisconnectedFlag).toBe(true);
    });
  });
});

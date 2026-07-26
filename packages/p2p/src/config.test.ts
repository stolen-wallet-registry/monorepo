import { describe, it, expect } from 'vitest';
import { getRelayServers, getRelayPeerIds, RELAY_SERVERS } from './config';
import { RelayConfigurationError } from './types';

describe('getRelayServers', () => {
  it('uses relayMultiaddr override when provided', () => {
    const result = getRelayServers({
      mode: 'development',
      relayMultiaddr: '/custom/p2p/QmCustom',
    });
    expect(result).toHaveLength(1);
    expect(result[0].multiaddr).toBe('/custom/p2p/QmCustom');
  });

  it.runIf(RELAY_SERVERS.production.length === 0)(
    'throws in production mode with no servers configured',
    () => {
      expect(() => getRelayServers({ mode: 'production' })).toThrow(RelayConfigurationError);
    }
  );

  // The development relay is a localhost multiaddr, so any deployed mode that fell back
  // to it would point users' browsers at their own machine.
  it('throws for non-development modes with no configured relays', () => {
    expect(() => getRelayServers({ mode: 'staging' })).toThrow(RelayConfigurationError);
  });

  it('honours an explicit multiaddr override in staging', () => {
    const result = getRelayServers({
      mode: 'staging',
      relayMultiaddr: '/dns4/relay.example.com/tcp/443/wss/p2p/QmTestPeer',
    });
    expect(result).toEqual([
      { multiaddr: '/dns4/relay.example.com/tcp/443/wss/p2p/QmTestPeer', isDev: true },
    ]);
  });
});

describe('getRelayPeerIds', () => {
  it('extracts peer ID from multiaddr', () => {
    const peerIds = getRelayPeerIds({
      mode: 'development',
      relayMultiaddr: '/ip4/1.2.3.4/tcp/4001/p2p/QmTestPeer',
    });
    expect(peerIds.has('QmTestPeer')).toBe(true);
  });

  it.runIf(RELAY_SERVERS.production.length === 0)(
    'returns empty set for unconfigured production',
    () => {
      const peerIds = getRelayPeerIds({ mode: 'production' });
      expect(peerIds.size).toBe(0);
    }
  );
});

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
  //
  // Guarded like its production sibling: config.ts carries an explicit TODO to add a
  // staging relay, and the day someone does, an unconditional version of this test would
  // fail for the wrong reason (a correctly configured staging relay, not a regression).
  it.runIf(RELAY_SERVERS.staging.length === 0)(
    'throws for non-development modes with no configured relays',
    () => {
      expect(() => getRelayServers({ mode: 'staging' })).toThrow(RelayConfigurationError);
    }
  );

  // Positive path: a configured environment returns its configured relays rather than
  // throwing. Pairs with the two guarded negative tests above, which would otherwise be the
  // only coverage and could pass because nothing loaded at all.
  it('returns the configured relays for a mode that has them', () => {
    const result = getRelayServers({ mode: 'development' });
    expect(result).toEqual(RELAY_SERVERS.development);
    expect(result.length).toBeGreaterThan(0);
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

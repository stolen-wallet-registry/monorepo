import { describe, it, expect } from 'vitest';
import { extractWsUrl } from './useRelayAvailability';

/**
 * The probe URL's scheme is load-bearing: an HTTPS page cannot open a `ws://` socket, so a
 * hard-coded `ws://` made every HTTPS deployment report P2P as permanently unavailable even
 * when the relay was healthy. These cases pin the scheme and host handling.
 */
describe('extractWsUrl', () => {
  it('builds ws:// from a plain /ws multiaddr', () => {
    expect(extractWsUrl('/ip4/127.0.0.1/tcp/12312/ws/p2p/12D3KooW')).toBe('ws://127.0.0.1:12312');
  });

  it('builds wss:// from a /wss multiaddr', () => {
    expect(extractWsUrl('/dns4/relay.example.com/tcp/443/wss/p2p/12D3KooW')).toBe(
      'wss://relay.example.com:443'
    );
  });

  it('builds wss:// from the /tls/ws multiaddr spelling', () => {
    expect(extractWsUrl('/dns4/relay.example.com/tcp/443/tls/ws/p2p/12D3KooW')).toBe(
      'wss://relay.example.com:443'
    );
  });

  it('supports dns and dns6 host components', () => {
    expect(extractWsUrl('/dns/relay.example.com/tcp/443/wss')).toBe('wss://relay.example.com:443');
    expect(extractWsUrl('/dns6/relay.example.com/tcp/443/wss')).toBe('wss://relay.example.com:443');
  });

  it('brackets IPv6 literals', () => {
    expect(extractWsUrl('/ip6/::1/tcp/12312/ws')).toBe('ws://[::1]:12312');
  });

  it('returns null when host or port is missing', () => {
    expect(extractWsUrl('/tcp/12312/ws')).toBeNull();
    expect(extractWsUrl('/ip4/127.0.0.1/ws')).toBeNull();
  });

  // `/wss` must not match a substring of some other protocol segment.
  it('does not treat a plain /ws multiaddr as secure', () => {
    expect(extractWsUrl('/ip4/10.0.0.1/tcp/80/ws')).toBe('ws://10.0.0.1:80');
  });
});

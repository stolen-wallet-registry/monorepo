/**
 * Uses node:test rather than vitest: the relay is dependency-light pure JS and adding a test
 * framework would mean a lockfile change for four pure functions.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  countReservationsByHost,
  createReservationGater,
  extractHost,
  ipv6Prefix64,
  readRelayLimits,
  shouldDenyReservation,
} from '../src/relay-limits.mjs';

describe('ipv6Prefix64', () => {
  test('keeps the first four groups', () => {
    assert.equal(ipv6Prefix64('2001:db8:1234:5678:9abc:def0:1234:5678'), '2001:db8:1234:5678::/64');
  });

  test('expands :: before slicing', () => {
    assert.equal(ipv6Prefix64('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(ipv6Prefix64('::1'), '0:0:0:0::/64');
  });

  test('normalises leading zeros and case so one prefix is one key', () => {
    assert.equal(ipv6Prefix64('2001:0DB8:0000:0001::5'), ipv6Prefix64('2001:db8:0:1::9'));
  });

  test('ignores a zone index', () => {
    assert.equal(ipv6Prefix64('fe80::1%eth0'), ipv6Prefix64('fe80::2'));
  });

  test('returns null for things that are not IPv6', () => {
    assert.equal(ipv6Prefix64('203.0.113.7'), null);
    assert.equal(ipv6Prefix64('relay.example'), null);
    assert.equal(ipv6Prefix64('2001::db8::1'), null);
  });
});

describe('extractHost', () => {
  test('pulls the IPv4 host out of a websocket multiaddr', () => {
    assert.equal(extractHost('/ip4/203.0.113.7/tcp/12312/ws'), '203.0.113.7');
  });

  test('groups IPv6 by /64 and normalises case', () => {
    assert.equal(extractHost('/ip6/2001:DB8::1/tcp/12312/ws'), '2001:db8:0:0::/64');
  });

  /**
   * The reason /64 masking exists. A /64 is the smallest block anyone is routinely assigned —
   * one household, one VPS. Keying on the full 128-bit address gave a single attacker 2^64
   * distinct "hosts", so the per-host cap of 8 capped nothing and one ordinary allocation
   * could fill all 512 global slots. That takes P2P relay registration offline, and P2P relay
   * is the ONLY route left to a victim whose wallet is fully drained.
   */
  test('two addresses in the same /64 are one host', () => {
    const a = extractHost('/ip6/2001:db8:abcd:0001::1/tcp/12312/ws');
    const b = extractHost('/ip6/2001:db8:abcd:0001:ffff:ffff:ffff:ffff/tcp/12312/ws');
    assert.equal(a, b);
  });

  test('a different /64 is a different host', () => {
    const a = extractHost('/ip6/2001:db8:abcd:0001::1/tcp/12312/ws');
    const b = extractHost('/ip6/2001:db8:abcd:0002::1/tcp/12312/ws');
    assert.notEqual(a, b);
  });

  test('an unparseable ip6 value still yields a stable key rather than null', () => {
    // Fail-safe, not fail-open: we would rather over-group than lose attribution entirely.
    assert.equal(extractHost('/ip6/not-an-address/tcp/1/ws'), 'not-an-address');
  });

  test('handles dns forms', () => {
    assert.equal(extractHost('/dns4/relay.example/tcp/443/wss'), 'relay.example');
    assert.equal(extractHost('/dnsaddr/relay.example/tcp/443'), 'relay.example');
  });

  test('ignores the p2p component when extracting', () => {
    assert.equal(extractHost('/ip4/198.51.100.4/tcp/12312/ws/p2p/12D3KooWabc'), '198.51.100.4');
  });

  // Returning null (not throwing, not a bogus key) is what lets the gater fail open.
  test('returns null for addresses with no recognisable host', () => {
    assert.equal(extractHost('/memory/xyz'), null);
    assert.equal(extractHost(''), null);
    assert.equal(extractHost(null), null);
    assert.equal(extractHost(undefined), null);
  });

  test('accepts a multiaddr object via toString', () => {
    assert.equal(extractHost({ toString: () => '/ip4/10.1.2.3/tcp/1/ws' }), '10.1.2.3');
  });
});

describe('countReservationsByHost', () => {
  test('groups reservations by source host', () => {
    const counts = countReservationsByHost([
      ['a', { addr: '/ip4/1.1.1.1/tcp/1/ws' }],
      ['b', { addr: '/ip4/1.1.1.1/tcp/2/ws' }],
      ['c', { addr: '/ip4/2.2.2.2/tcp/3/ws' }],
    ]);
    assert.equal(counts.get('1.1.1.1'), 2);
    assert.equal(counts.get('2.2.2.2'), 1);
  });

  // The counting half of the /64 fix: 8 addresses from one allocation must count as 8 against
  // one host, not 1 each against 8 hosts.
  test('counts every address in a /64 against the same host', () => {
    const counts = countReservationsByHost([
      ['a', { addr: '/ip6/2001:db8:0:1::1/tcp/1/ws' }],
      ['b', { addr: '/ip6/2001:db8:0:1::2/tcp/2/ws' }],
      ['c', { addr: '/ip6/2001:db8:0:1:aaaa:bbbb:cccc:dddd/tcp/3/ws' }],
      ['d', { addr: '/ip6/2001:db8:0:2::1/tcp/4/ws' }],
    ]);
    assert.equal(counts.size, 2);
    assert.equal(counts.get('2001:db8:0:1::/64'), 3);
    assert.equal(counts.get('2001:db8:0:2::/64'), 1);
  });

  test('skips unattributable reservations rather than bucketing them together', () => {
    const counts = countReservationsByHost([
      ['a', { addr: '/memory/x' }],
      ['b', {}],
      ['c', { addr: '/ip4/3.3.3.3/tcp/1/ws' }],
    ]);
    assert.equal(counts.size, 1);
    assert.equal(counts.get('3.3.3.3'), 1);
  });
});

describe('shouldDenyReservation', () => {
  const perHost = 8;

  test('allows a host below the cap', () => {
    assert.equal(
      shouldDenyReservation({
        requestingHost: '1.1.1.1',
        alreadyReserved: false,
        reservationsByHost: new Map([['1.1.1.1', 7]]),
        reservationsPerHost: perHost,
      }),
      false
    );
  });

  test('denies a host at the cap', () => {
    assert.equal(
      shouldDenyReservation({
        requestingHost: '1.1.1.1',
        alreadyReserved: false,
        reservationsByHost: new Map([['1.1.1.1', 8]]),
        reservationsPerHost: perHost,
      }),
      true
    );
  });

  // A refresh must never be denied: the peer already holds the slot, and evicting a
  // long-running flow at renewal time would break exactly the registrations we protect.
  test('always allows a renewal, even for a host at the cap', () => {
    assert.equal(
      shouldDenyReservation({
        requestingHost: '1.1.1.1',
        alreadyReserved: true,
        reservationsByHost: new Map([['1.1.1.1', 99]]),
        reservationsPerHost: perHost,
      }),
      false
    );
  });

  // Fail open: an unattributable source falls back to the global ceiling. Denying here would
  // let one odd transport take the relay offline for everyone.
  test('allows when the host cannot be determined', () => {
    assert.equal(
      shouldDenyReservation({
        requestingHost: null,
        alreadyReserved: false,
        reservationsByHost: new Map(),
        reservationsPerHost: perHost,
      }),
      false
    );
  });

  test('one host cannot exhaust the global ceiling', () => {
    // 512 global slots, 8 per host => at least 64 distinct hosts required.
    const { maxReservations, reservationsPerHost } = readRelayLimits({});
    assert.ok(maxReservations / reservationsPerHost >= 64);
  });
});

describe('createReservationGater', () => {
  function makeGater({ reservations, connectionAddr, reservationsPerHost = 2 }) {
    const map = new Map(reservations);
    return createReservationGater({
      getNode: () => ({
        getConnections: () => (connectionAddr ? [{ remoteAddr: connectionAddr }] : []),
      }),
      getRelayService: () => ({
        reservations: { entries: () => map.entries(), get: (peer) => map.get(peer) },
      }),
      reservationsPerHost,
    });
  }

  test('denies a peer whose host is already at the cap', async () => {
    const gater = makeGater({
      reservations: [
        ['p1', { addr: '/ip4/9.9.9.9/tcp/1/ws' }],
        ['p2', { addr: '/ip4/9.9.9.9/tcp/2/ws' }],
      ],
      connectionAddr: '/ip4/9.9.9.9/tcp/3/ws',
    });
    assert.equal(await gater('p3'), true);
  });

  // End to end for the /64 fix: an attacker rotating source addresses inside one allocation
  // is denied, where before the fix each new address looked like a brand-new host.
  test('denies a peer rotating addresses within one IPv6 /64', async () => {
    const gater = makeGater({
      reservations: [
        ['p1', { addr: '/ip6/2001:db8:0:7::1/tcp/1/ws' }],
        ['p2', { addr: '/ip6/2001:db8:0:7::2/tcp/2/ws' }],
      ],
      connectionAddr: '/ip6/2001:db8:0:7::dead/tcp/3/ws',
    });
    assert.equal(await gater('p3'), true);
  });

  test('allows a peer from a different IPv6 /64', async () => {
    const gater = makeGater({
      reservations: [
        ['p1', { addr: '/ip6/2001:db8:0:7::1/tcp/1/ws' }],
        ['p2', { addr: '/ip6/2001:db8:0:7::2/tcp/2/ws' }],
      ],
      connectionAddr: '/ip6/2001:db8:0:8::1/tcp/3/ws',
    });
    assert.equal(await gater('p3'), false);
  });

  test('allows a peer from an unaffected host', async () => {
    const gater = makeGater({
      reservations: [
        ['p1', { addr: '/ip4/9.9.9.9/tcp/1/ws' }],
        ['p2', { addr: '/ip4/9.9.9.9/tcp/2/ws' }],
      ],
      connectionAddr: '/ip4/8.8.8.8/tcp/3/ws',
    });
    assert.equal(await gater('p3'), false);
  });

  test('allows an existing holder to renew', async () => {
    const gater = makeGater({
      reservations: [
        ['p1', { addr: '/ip4/9.9.9.9/tcp/1/ws' }],
        ['p2', { addr: '/ip4/9.9.9.9/tcp/2/ws' }],
      ],
      connectionAddr: '/ip4/9.9.9.9/tcp/1/ws',
    });
    assert.equal(await gater('p1'), false);
  });

  test('fails open when the node or relay service is not ready', async () => {
    const gater = createReservationGater({
      getNode: () => null,
      getRelayService: () => null,
      reservationsPerHost: 1,
    });
    assert.equal(await gater('p1'), false);
  });

  test('fails open when the peer has no connection to inspect', async () => {
    const gater = makeGater({ reservations: [], connectionAddr: null });
    assert.equal(await gater('p1'), false);
  });

  test('reports the offending host to the caller', async () => {
    let seen = null;
    const map = new Map([
      ['p1', { addr: '/ip4/7.7.7.7/tcp/1/ws' }],
      ['p2', { addr: '/ip4/7.7.7.7/tcp/2/ws' }],
    ]);
    const gater = createReservationGater({
      getNode: () => ({ getConnections: () => [{ remoteAddr: '/ip4/7.7.7.7/tcp/3/ws' }] }),
      getRelayService: () => ({
        reservations: { entries: () => map.entries(), get: (p) => map.get(p) },
      }),
      reservationsPerHost: 2,
      onDeny: (host) => {
        seen = host;
      },
    });
    assert.equal(await gater('p3'), true);
    assert.equal(seen, '7.7.7.7');
  });
});

describe('readRelayLimits', () => {
  test('applies documented defaults', () => {
    const limits = readRelayLimits({});
    assert.equal(limits.maxReservations, 512);
    assert.equal(limits.reservationsPerHost, 8);
    assert.equal(limits.maxConnections, 600);
    assert.equal(limits.reservationTtlMs, 20 * 60 * 1000);
  });

  // The TTL must outlive a worst-case flow: 1-4 min randomized grace period plus the
  // registration window, ~15 minutes. Guard against someone "hardening" it into a breakage.
  test('default TTL comfortably exceeds a worst-case registration flow', () => {
    assert.ok(readRelayLimits({}).reservationTtlMs >= 15 * 60 * 1000);
  });

  test('connection ceiling stays above the reservation ceiling', () => {
    const limits = readRelayLimits({});
    assert.ok(limits.maxConnections > limits.maxReservations);
  });

  test('reads overrides from env', () => {
    const limits = readRelayLimits({
      RELAY_MAX_RESERVATIONS: '64',
      RELAY_RESERVATIONS_PER_HOST: '2',
      RELAY_MAX_CONNECTIONS: '128',
      RELAY_RESERVATION_TTL_MS: '600000',
    });
    assert.equal(limits.maxReservations, 64);
    assert.equal(limits.reservationsPerHost, 2);
    assert.equal(limits.maxConnections, 128);
    assert.equal(limits.reservationTtlMs, 600000);
  });

  // A typo must not silently disable a limit — notably `0`, which would mean "unlimited"
  // if it were accepted.
  test('falls back to defaults on malformed or zero values', () => {
    const limits = readRelayLimits({
      RELAY_MAX_RESERVATIONS: 'many',
      RELAY_RESERVATIONS_PER_HOST: '0',
      RELAY_RESERVATION_TTL_MS: '-1',
    });
    assert.equal(limits.maxReservations, 512);
    assert.equal(limits.reservationsPerHost, 8);
    assert.equal(limits.reservationTtlMs, 20 * 60 * 1000);
  });
});

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
  PENDING_RESERVATION_TTL_MS,
  readRelayLimits,
  shouldDenyReservation,
  validateRelayLimits,
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

// An IPv4-mapped address is an IPv4 host in an IPv6 costume: its top 96 bits are constant, so
// /64-grouping it filed every IPv4 client on earth under one `0:0:0:0::/64` bucket. With the
// default cap of 8 that turns a per-host availability control into a global 8-slot cap on the
// only registration path a fully drained wallet has. Dormant on the current `/ip4/0.0.0.0`
// listen address; live the moment anyone switches to `/ip6/::` for dual-stack, because
// @libp2p/utils routes anything isIPv6() — including ::ffff:x.x.x.x — to an /ip6/ multiaddr.
describe('ipv6Prefix64 — IPv4-mapped addresses', () => {
  test('returns the embedded IPv4 rather than a shared /64 bucket', () => {
    assert.equal(ipv6Prefix64('::ffff:192.168.1.1'), '192.168.1.1');
    assert.equal(ipv6Prefix64('::ffff:8.8.8.8'), '8.8.8.8');
  });

  // The three cases verified in the review as colliding before the fix.
  test('keeps two different IPv4 clients in different buckets', () => {
    assert.notEqual(ipv6Prefix64('::ffff:192.168.1.1'), ipv6Prefix64('::ffff:8.8.8.8'));
    assert.notEqual(ipv6Prefix64('::ffff:192.168.1.1'), ipv6Prefix64('::1'));
  });

  test('matches the bare IPv4 key, so one client is one bucket across transports', () => {
    // extractHost uses ip4 values verbatim, so `/ip4/8.8.8.8` and `/ip6/::ffff:8.8.8.8` must
    // agree or the same host gets two allowances.
    assert.equal(ipv6Prefix64('::ffff:8.8.8.8'), '8.8.8.8');
    assert.equal(
      extractHost('/ip6/::ffff:8.8.8.8/tcp/443/ws'),
      extractHost('/ip4/8.8.8.8/tcp/443/ws')
    );
  });

  test('handles the long-form and IPv4-compatible spellings', () => {
    assert.equal(ipv6Prefix64('0:0:0:0:0:ffff:8.8.8.8'), '8.8.8.8');
    assert.equal(ipv6Prefix64('::8.8.8.8'), '8.8.8.8');
  });

  test('rejects an out-of-range or padded quad rather than inventing a key', () => {
    assert.equal(ipv6Prefix64('::ffff:999.1.1.1'), null);
    assert.equal(ipv6Prefix64('::ffff:08.8.8.8'), null);
  });

  // A genuine IPv6 address with a dotted tail is still a /64 allocation, not a single host.
  test('leaves a real IPv6 address with an embedded quad on the /64 path', () => {
    assert.equal(ipv6Prefix64('2001:db8::1.2.3.4'), '2001:db8:0:0::/64');
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
        requestingHosts: ['1.1.1.1'],
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
        requestingHosts: ['1.1.1.1'],
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
        requestingHosts: ['1.1.1.1'],
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
        requestingHosts: [],
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

  // A peer can hold several connections and they need not share a source. Charging it to
  // whichever the array ordered first let an attacker at the cap open one connection from a
  // fresh address and keep reserving; ANY presented host being full must deny.
  test('denies when any presented host is at the cap, not just the first', () => {
    assert.equal(
      shouldDenyReservation({
        requestingHosts: ['8.8.8.8', '1.1.1.1'],
        alreadyReserved: false,
        reservationsByHost: new Map([['1.1.1.1', 8]]),
        reservationsPerHost: perHost,
      }),
      true
    );
  });

  test('allows when every presented host is below the cap', () => {
    assert.equal(
      shouldDenyReservation({
        requestingHosts: ['8.8.8.8', '1.1.1.1'],
        alreadyReserved: false,
        reservationsByHost: new Map([
          ['1.1.1.1', 7],
          ['8.8.8.8', 1],
        ]),
        reservationsPerHost: perHost,
      }),
      false
    );
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

  // ── D5b-i: the cap must hold against a BURST, not just a sequence ─────────────────────────
  //
  // circuit-relay-v2 calls `reservationStore.reserve()` only after the gater's promise
  // resolves, so a grant is invisible to concurrent gater calls. Every test above feeds the
  // gater a store that already reflects prior grants — which is the sequential case, and the
  // case an attacker will not use. These drive the interleaving that actually happens.
  describe('in-flight reservations are counted', () => {
    function makeBurstGater({ reservationsPerHost = 2, now = () => 0, addr } = {}) {
      const map = new Map();
      const gater = createReservationGater({
        getNode: () => ({ getConnections: () => [{ remoteAddr: addr }] }),
        getRelayService: () => ({
          reservations: { entries: () => map.entries(), get: (peer) => map.get(peer) },
        }),
        reservationsPerHost,
        now,
      });
      return { gater, map };
    }

    const ADDR = '/ip4/9.9.9.9/tcp/1/ws';

    test('a concurrent burst from one host cannot exceed the per-host cap', async () => {
      const { gater } = makeBurstGater({ reservationsPerHost: 2, addr: ADDR });

      // Ten RESERVE streams, none of which has reached reserve() yet. Before the in-flight
      // ledger every one of them read a stored count of 0 and all ten were granted, so one
      // host could take the whole 512-slot ceiling in a single burst.
      const verdicts = await Promise.all(Array.from({ length: 10 }, (_, i) => gater(`p${i}`)));

      assert.equal(
        verdicts.filter((denied) => denied === false).length,
        2,
        'exactly reservationsPerHost grants should survive a simultaneous burst'
      );
    });

    // The other direction: the ledger must not double-count. An entry that stayed after its
    // reservation landed would permanently halve the effective cap.
    test('retires an in-flight grant once the reservation appears in the store', async () => {
      const { gater, map } = makeBurstGater({ reservationsPerHost: 2, addr: ADDR });

      assert.equal(await gater('p1'), false); // granted; now pending
      map.set('p1', { addr: ADDR }); // reserve() ran

      assert.equal(await gater('p2'), false); // 1 stored + 0 pending < 2
      map.set('p2', { addr: ADDR });

      assert.equal(await gater('p3'), true); // 2 stored => at cap
    });

    // Backstop for a grant whose reserve() never ran (handshake died after the gater said
    // yes). Without the TTL that slot would be held in the ledger for the life of the process.
    test('expires an in-flight grant that never reaches the store', async () => {
      let clock = 0;
      const { gater } = makeBurstGater({
        reservationsPerHost: 1,
        addr: ADDR,
        now: () => clock,
      });

      assert.equal(await gater('p1'), false); // granted, pending, never stored
      assert.equal(await gater('p2'), true); // still counted => cap reached

      clock += PENDING_RESERVATION_TTL_MS + 1;

      assert.equal(await gater('p3'), false); // stale entry dropped
    });

    test('does not count a peer against its own earlier in-flight grant', async () => {
      const { gater } = makeBurstGater({ reservationsPerHost: 1, addr: ADDR });

      assert.equal(await gater('p1'), false);
      // A retry of the SAME peer is the same slot, so it must not be denied by its own record.
      assert.equal(await gater('p1'), false);
    });
  });

  // D5b-ii: a peer holding connections from two hosts used to be charged to whichever the
  // array ordered first, so an attacker at the cap could open one connection from a fresh
  // address and keep reserving.
  test('charges a multi-connection peer against every host it presents', async () => {
    const map = new Map([
      ['p1', { addr: '/ip4/9.9.9.9/tcp/1/ws' }],
      ['p2', { addr: '/ip4/9.9.9.9/tcp/2/ws' }],
    ]);
    const gater = createReservationGater({
      getNode: () => ({
        getConnections: () => [
          { remoteAddr: '/ip4/8.8.8.8/tcp/3/ws' }, // fresh address, listed first
          { remoteAddr: '/ip4/9.9.9.9/tcp/4/ws' }, // the exhausted one
        ],
      }),
      getRelayService: () => ({
        reservations: { entries: () => map.entries(), get: (peer) => map.get(peer) },
      }),
      reservationsPerHost: 2,
    });

    assert.equal(await gater('p3'), true);
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

  // Falling back is right; falling back SILENTLY is not. `1O24` with a letter O is
  // indistinguishable from never setting the variable, and the operator believes a ceiling is
  // in force that never was.
  test('warns about every rejected value instead of falling back quietly', () => {
    const warnings = [];
    const limits = readRelayLimits(
      { RELAY_MAX_RESERVATIONS: '1O24', RELAY_MAX_CONNECTIONS: '12.5' },
      (message) => warnings.push(message)
    );

    assert.equal(limits.maxReservations, 512);
    assert.equal(limits.maxConnections, 600);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((w) => w.includes('RELAY_MAX_RESERVATIONS') && w.includes('1O24')));
    assert.ok(warnings.some((w) => w.includes('RELAY_MAX_CONNECTIONS') && w.includes('12.5')));
  });

  test('says nothing when every value is accepted', () => {
    const warnings = [];
    readRelayLimits({ RELAY_MAX_RESERVATIONS: '64' }, (message) => warnings.push(message));
    assert.deepEqual(warnings, []);
  });
});

// The invariants below were previously asserted only for the DEFAULTS, so any deployment that
// set one variable in isolation walked straight past them.
describe('validateRelayLimits', () => {
  test('accepts the default set', () => {
    assert.deepEqual(validateRelayLimits(readRelayLimits({})), []);
  });

  // The finding: RELAY_MAX_CONNECTIONS=50 against the default 512 reservation ceiling caps
  // reservations at ~50, because every reservation holds a live connection — while the
  // startup banner prints 512.
  test('flags a connection ceiling that silently caps reservations', () => {
    const problems = validateRelayLimits(
      readRelayLimits({ RELAY_MAX_CONNECTIONS: '50' }, () => {})
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /RELAY_MAX_CONNECTIONS/);
    assert.match(problems[0], /512/);
  });

  test('flags a per-host cap that does not actually cap anything', () => {
    const problems = validateRelayLimits(
      readRelayLimits({ RELAY_MAX_RESERVATIONS: '8', RELAY_RESERVATIONS_PER_HOST: '8' }, () => {})
    );
    assert.ok(problems.some((p) => p.includes('RELAY_RESERVATIONS_PER_HOST')));
  });

  test('flags a TTL shorter than a worst-case registration flow', () => {
    const problems = validateRelayLimits(
      readRelayLimits({ RELAY_RESERVATION_TTL_MS: '60000' }, () => {})
    );
    assert.ok(problems.some((p) => p.includes('RELAY_RESERVATION_TTL_MS')));
  });
});

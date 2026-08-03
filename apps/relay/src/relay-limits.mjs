/**
 * Reservation limits for the circuit relay (security audit V21 — Medium).
 *
 * The relay is the only path to registration for a victim whose wallet is drained: they have
 * no funds, so standard and self-relay registration are both unavailable to them. Taking the
 * relay down does not degrade the product, it removes the single option those users have.
 *
 * The original numbers made that trivial. `maxReservations: 15` with a 30-minute TTL and no
 * per-source cap meant one host could hold every slot for half an hour, indefinitely, with 15
 * cheap WebSocket connections.
 *
 * @libp2p/circuit-relay-v2 4.1.2 offers no per-peer or per-IP reservation option — only a
 * global `maxReservations`. But the server calls
 * `connectionGater.denyInboundRelayReservation(remotePeer)` immediately BEFORE
 * `reservationStore.reserve()` (server/index.js:123-128), so the gater is a real,
 * synchronous enforcement point built on public API. That is what `createReservationGater`
 * below hooks, giving the per-source cap the library does not provide.
 */

/** One flow needs 2 reservations (registeree + relayer). See RESERVATIONS_PER_HOST. */
const DEFAULT_RESERVATIONS_PER_HOST = 8;
const DEFAULT_MAX_RESERVATIONS = 512;
const DEFAULT_MAX_CONNECTIONS = 600;
const DEFAULT_RESERVATION_TTL_MS = 20 * 60 * 1000;

/**
 * Parse a positive-integer env var, falling back loudly.
 *
 * The fallback used to be silent, which made a typo indistinguishable from not setting the
 * variable at all: `RELAY_MAX_RESERVATIONS=1O24` (letter O) resolved to 512 and the operator
 * had no way to know their intended 1024 never took effect. These values are the difference
 * between a relay that survives a flood and one that does not, so a rejected value has to be
 * visible in the logs at the moment it is rejected.
 *
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} name  env var name, for the warning
 * @param {(message: string) => void} [warn]
 */
function readInt(raw, fallback, name, warn = console.warn) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    warn(
      `⚠ ${name}="${raw}" is not a positive integer — ignoring it and using ${fallback}. ` +
        `Fix the value or unset it; the relay is running with the default, not with yours.`
    );
    return fallback;
  }
  return parsed;
}

/**
 * Check the RESOLVED limits against the invariants the comments below assert.
 *
 * Those invariants were only ever asserted for the DEFAULTS, in a unit test. A deployment
 * setting `RELAY_MAX_CONNECTIONS=50` against the untouched 512 reservation ceiling silently
 * capped reservations at ~50 — every reservation is backed by a live connection — and the
 * startup log happily printed "512 total" while the real ceiling was a tenth of that.
 *
 * Returns problems rather than throwing: a misconfigured relay that still runs is better for
 * the drained-wallet user than no relay at all. The caller logs them.
 *
 * @param {{ maxReservations: number, reservationsPerHost: number, maxConnections: number, reservationTtlMs: number }} limits
 * @returns {string[]} human-readable problems, empty when the set is coherent
 */
export function validateRelayLimits(limits) {
  const problems = [];

  if (limits.maxConnections <= limits.maxReservations) {
    problems.push(
      `RELAY_MAX_CONNECTIONS (${limits.maxConnections}) must exceed RELAY_MAX_RESERVATIONS ` +
        `(${limits.maxReservations}): every reservation holds a live connection, so the real ` +
        `reservation ceiling is ${limits.maxConnections}, not ${limits.maxReservations}.`
    );
  }

  if (limits.reservationsPerHost >= limits.maxReservations) {
    problems.push(
      `RELAY_RESERVATIONS_PER_HOST (${limits.reservationsPerHost}) is not below ` +
        `RELAY_MAX_RESERVATIONS (${limits.maxReservations}): one host can take every slot, ` +
        `which is the exhaustion the per-host cap exists to prevent.`
    );
  }

  // A registration is a 1-4 minute randomized grace period plus the registration window,
  // ~15 minutes worst case. A TTL under that drops the reservation mid-flow.
  if (limits.reservationTtlMs < 15 * 60 * 1000) {
    problems.push(
      `RELAY_RESERVATION_TTL_MS (${limits.reservationTtlMs}) is under the ~15 minute worst-case ` +
        `registration flow: a reservation can expire between the acknowledgement and the ` +
        `registration signature.`
    );
  }

  return problems;
}

export function readRelayLimits(env = process.env, warn = console.warn) {
  return {
    /**
     * Global reservation ceiling, raised from the library default of 15.
     *
     * 15 was the entire problem: it is fewer slots than a single laptop can occupy, so
     * exhaustion needed no botnet and no bandwidth. 512 costs little — a reservation is a
     * map entry plus an idle WebSocket — and combined with the per-host cap it takes 64
     * distinct source addresses to fill, instead of one.
     */
    maxReservations: readInt(
      env.RELAY_MAX_RESERVATIONS,
      DEFAULT_MAX_RESERVATIONS,
      'RELAY_MAX_RESERVATIONS',
      warn
    ),

    /**
     * Reservations permitted from a single source host.
     *
     * A registration flow needs two (registeree + relayer), normally on different hosts. 8
     * leaves room for a shared NAT, a household running several flows, and reconnect churn
     * where a stale reservation has not yet expired, while making single-source exhaustion
     * of the 512 ceiling impossible.
     */
    reservationsPerHost: readInt(
      env.RELAY_RESERVATIONS_PER_HOST,
      DEFAULT_RESERVATIONS_PER_HOST,
      'RELAY_RESERVATIONS_PER_HOST',
      warn
    ),

    /**
     * Connection ceiling, raised from 100.
     *
     * Every reservation is backed by a live connection, so a 100-connection cap would have
     * silently capped reservations at ~100 regardless of maxReservations. 600 keeps headroom
     * over the 512 reservation ceiling for in-flight dials and relayed streams.
     */
    maxConnections: readInt(
      env.RELAY_MAX_CONNECTIONS,
      DEFAULT_MAX_CONNECTIONS,
      'RELAY_MAX_CONNECTIONS',
      warn
    ),

    /**
     * Reservation lifetime, reduced from 30 minutes.
     *
     * This is how long an abandoned or hostile reservation keeps its slot. It must still
     * outlive one registration: a 1-4 minute randomized grace period plus the registration
     * window, ~15 minutes worst case. 20 minutes covers that even if renewal never happens.
     *
     * Shortening it is safe because the client transport refreshes automatically 5 minutes
     * before expiry (transport/reservation-store.js REFRESH_TIMEOUT), so a live peer re-ups
     * at the 15 minute mark and a dead one releases its slot 10 minutes sooner than before.
     */
    reservationTtlMs: readInt(
      env.RELAY_RESERVATION_TTL_MS,
      DEFAULT_RESERVATION_TTL_MS,
      'RELAY_RESERVATION_TTL_MS',
      warn
    ),
  };
}

/**
 * Collapse an IPv6 address to its /64 prefix.
 *
 * A /64 is the smallest block anyone is routinely assigned — it is what a residential ISP
 * hands a single household and what a VPS provider hands a single instance. Keying the
 * per-host cap on the full 128-bit address therefore does not cap a host at all: one ordinary
 * allocation yields 2^64 distinct "hosts", enough for one attacker to fill every one of the
 * 512 global slots and take P2P registration — the only route open to a fully drained wallet
 * — offline. Grouping by /64 makes one allocation count as one host.
 *
 * Returns null for anything that does not parse as IPv6, so the caller falls back to the
 * global ceiling rather than inventing a key.
 *
 * IPv4-MAPPED ADDRESSES ARE NOT /64-GROUPED. `::ffff:1.2.3.4` is an IPv4 host wearing an IPv6
 * costume: its high 96 bits are a constant, so grouping it by /64 put every IPv4 client on
 * earth — plus `::1` — into one `0:0:0:0::/64` bucket. That inverts the control. The per-host
 * cap becomes a GLOBAL cap of `reservationsPerHost` (8 by default), and the 9th IPv4
 * registrant anywhere is denied a reservation, on the only registration path available to a
 * fully drained wallet.
 *
 * This is dormant only while the relay listens on `/ip4/0.0.0.0` — @libp2p/utils routes
 * anything `isIPv6()`, including `::ffff:x.x.x.x`, to an `/ip6/` multiaddr, so switching to
 * `/ip6/::` for dual-stack (the natural next step) is all it takes. The embedded IPv4 is
 * returned verbatim instead, which also makes the same client one bucket whether it arrived
 * over `/ip4/1.2.3.4` or `/ip6/::ffff:1.2.3.4`.
 *
 * @param {string} address
 * @returns {string | null}
 */
export function ipv6Prefix64(address) {
  // Strip a zone index (fe80::1%eth0) before parsing.
  const bare = address.split('%')[0];
  if (!bare.includes(':')) return null;

  // An IPv4-mapped (::ffff:1.2.3.4) or IPv4-compatible (::1.2.3.4) address identifies a single
  // IPv4 host, not a /64 allocation. Key it on that host.
  const mapped = /^(?:0*:)*(?:ffff:)?((?:\d{1,3}\.){3}\d{1,3})$/i.exec(bare);
  if (mapped) {
    const octets = mapped[1].split('.');
    return octets.every((o) => Number(o) <= 255 && String(Number(o)) === o) ? mapped[1] : null;
  }

  const halves = bare.split('::');
  if (halves.length > 2) return null;

  /** @param {string} half */
  const groupsOf = (half) => (half === '' ? [] : half.split(':').filter((g) => g !== ''));

  const head = groupsOf(halves[0]);
  const tail = halves.length === 2 ? groupsOf(halves[1]) : [];

  let groups;
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  // Normalise each group (drop leading zeros) so 2001:0db8:… and 2001:db8:… are one key.
  const prefix = groups.slice(0, 4).map((g) => {
    const parsed = Number.parseInt(g, 16);
    return Number.isNaN(parsed) ? null : parsed.toString(16);
  });
  if (prefix.some((g) => g === null)) return null;

  return `${prefix.join(':')}::/64`;
}

/**
 * Extract the source host from a multiaddr, for grouping reservations by origin.
 *
 * IPv6 sources are grouped by /64 (see `ipv6Prefix64`); IPv4 and DNS sources are used
 * verbatim, as are IPv4-mapped IPv6 sources, which resolve back to the embedded IPv4 so that
 * `/ip4/1.2.3.4` and `/ip6/::ffff:1.2.3.4` are one bucket rather than two.
 *
 * Returns null when the address has no host component we recognise; callers treat that as
 * "cannot attribute" and fall back to the global ceiling rather than denying, so an
 * unexpected transport can never take the relay offline for everyone.
 *
 * @param {{ toString: () => string }} multiaddr
 * @returns {string | null}
 */
export function extractHost(multiaddr) {
  if (multiaddr == null) return null;

  const parts = String(multiaddr).split('/');
  // Multiaddrs are /proto/value pairs; a leading empty segment comes from the leading slash.
  for (let i = 0; i < parts.length - 1; i++) {
    const protocol = parts[i];
    if (
      protocol === 'ip4' ||
      protocol === 'ip6' ||
      protocol === 'dns' ||
      protocol === 'dns4' ||
      protocol === 'dns6' ||
      protocol === 'dnsaddr'
    ) {
      const value = parts[i + 1];
      if (value === undefined || value.length === 0) return null;
      const host = value.toLowerCase();
      if (protocol === 'ip6') return ipv6Prefix64(host) ?? host;
      return host;
    }
  }
  return null;
}

/**
 * Count reservations currently held per source host.
 *
 * @param {Iterable<[unknown, { addr?: unknown }]>} reservationEntries
 * @returns {Map<string, number>}
 */
export function countReservationsByHost(reservationEntries) {
  const counts = new Map();
  for (const [, reservation] of reservationEntries) {
    const host = extractHost(reservation?.addr);
    if (host === null) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return counts;
}

/**
 * Decide whether a peer may take another reservation.
 *
 * Renewals must not be counted against the cap — the peer already holds its slot and is
 * merely extending it, so treating a refresh as a new reservation would evict long-running
 * legitimate flows at exactly the moment they matter.
 *
 * @returns {boolean} true to DENY, matching the connectionGater contract.
 */
export function shouldDenyReservation({
  requestingHost,
  alreadyReserved,
  reservationsByHost,
  reservationsPerHost,
}) {
  if (alreadyReserved) return false;
  if (requestingHost === null || requestingHost === undefined) return false;
  return (reservationsByHost.get(requestingHost) ?? 0) >= reservationsPerHost;
}

/**
 * Build the `denyInboundRelayReservation` gater.
 *
 * `getNode` and `getRelayService` are lazy because the gater must be handed to
 * `createLibp2p()` before the node it inspects exists. They are only ever called while
 * handling an inbound HOP request, which cannot happen before startup completes.
 *
 * @param {{
 *   getNode: () => { getConnections: (peerId: unknown) => Array<{ remoteAddr: unknown }> } | null,
 *   getRelayService: () => { reservations?: { entries: () => Iterable<[unknown, { addr?: unknown }]> } } | null,
 *   reservationsPerHost: number,
 *   onDeny?: (host: string, peerId: string) => void,
 * }} options
 */
export function createReservationGater({ getNode, getRelayService, reservationsPerHost, onDeny }) {
  return async function denyInboundRelayReservation(remotePeer) {
    const node = getNode();
    const relayService = getRelayService();
    if (node == null || relayService?.reservations == null) return false;

    const connections = node.getConnections(remotePeer) ?? [];
    if (connections.length === 0) return false;

    const requestingHost = extractHost(connections[0]?.remoteAddr);

    // A peer renewing its existing reservation is already accounted for.
    const alreadyReserved = Boolean(relayService.reservations.get?.(remotePeer));

    const deny = shouldDenyReservation({
      requestingHost,
      alreadyReserved,
      reservationsByHost: countReservationsByHost(relayService.reservations.entries()),
      reservationsPerHost,
    });

    if (deny && requestingHost !== null) {
      onDeny?.(requestingHost, String(remotePeer));
    }
    return deny;
  };
}

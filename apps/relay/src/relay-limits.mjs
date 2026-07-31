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

function readInt(raw, fallback) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function readRelayLimits(env = process.env) {
  return {
    /**
     * Global reservation ceiling, raised from the library default of 15.
     *
     * 15 was the entire problem: it is fewer slots than a single laptop can occupy, so
     * exhaustion needed no botnet and no bandwidth. 512 costs little — a reservation is a
     * map entry plus an idle WebSocket — and combined with the per-host cap it takes 64
     * distinct source addresses to fill, instead of one.
     */
    maxReservations: readInt(env.RELAY_MAX_RESERVATIONS, DEFAULT_MAX_RESERVATIONS),

    /**
     * Reservations permitted from a single source host.
     *
     * A registration flow needs two (registeree + relayer), normally on different hosts. 8
     * leaves room for a shared NAT, a household running several flows, and reconnect churn
     * where a stale reservation has not yet expired, while making single-source exhaustion
     * of the 512 ceiling impossible.
     */
    reservationsPerHost: readInt(env.RELAY_RESERVATIONS_PER_HOST, DEFAULT_RESERVATIONS_PER_HOST),

    /**
     * Connection ceiling, raised from 100.
     *
     * Every reservation is backed by a live connection, so a 100-connection cap would have
     * silently capped reservations at ~100 regardless of maxReservations. 600 keeps headroom
     * over the 512 reservation ceiling for in-flight dials and relayed streams.
     */
    maxConnections: readInt(env.RELAY_MAX_CONNECTIONS, DEFAULT_MAX_CONNECTIONS),

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
    reservationTtlMs: readInt(env.RELAY_RESERVATION_TTL_MS, DEFAULT_RESERVATION_TTL_MS),
  };
}

/**
 * Extract the source host from a multiaddr, for grouping reservations by origin.
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
      return value !== undefined && value.length > 0 ? value.toLowerCase() : null;
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

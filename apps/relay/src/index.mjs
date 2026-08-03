import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p } from 'libp2p';
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';

import fs from 'fs';

import { KEYS_PATH, RELAY_PORT } from './config.mjs';
import { verifyKeyIntegrity, writeFileSecurely, acquireLock, releaseLock } from './key-utils.mjs';
import { createReservationGater, readRelayLimits, validateRelayLimits } from './relay-limits.mjs';

const isProduction = process.env.NODE_ENV === 'production';

let peerId;
let privateKey;

// TODO(p2p): Dockerfile hardening for the relay container.
// (The non-root half is done — the Dockerfile chowns /app and drops to `USER node`.)
// - Add HEALTHCHECK: a simple TCP check against port 12312 is sufficient until we add a real HTTP health endpoint.
//   Example: `HEALTHCHECK ... CMD node -e "const net=require('net');const s=net.connect(12312,'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));"`

/**
 * Load or generate Ed25519 keys for stable peer ID across restarts.
 *
 * libp2p 3.x uses Ed25519 keys (peer IDs start with "12D3KooW...").
 * Old RSA keys (peer IDs start with "Qm...") are not compatible.
 *
 * In production: Fail fast on any key issues - never auto-regenerate.
 * In development: Auto-generate keys if missing or invalid.
 */
async function loadOrGenerateKeys() {
  // Check for environment variable override (production preferred)
  if (process.env.RELAY_PRIVATE_KEY) {
    try {
      const privKeyBytes = Buffer.from(process.env.RELAY_PRIVATE_KEY, 'base64');
      privateKey = privateKeyFromProtobuf(privKeyBytes);
      peerId = peerIdFromPrivateKey(privateKey);
      console.log('Loaded keys from RELAY_PRIVATE_KEY environment variable');
      console.log('Peer ID:', peerId.toString());
      return;
    } catch (err) {
      throw new Error(
        `Invalid RELAY_PRIVATE_KEY: ${err.message}\n` +
          'Expected: base64-encoded Ed25519 private key protobuf.\n' +
          'Generate one using: pnpm relay:setup'
      );
    }
  }

  // Try to load from keys.json
  if (fs.existsSync(KEYS_PATH)) {
    try {
      const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));

      // Check if this is Ed25519 format (12D3KooW prefix)
      if (keys.id?.startsWith('12D3KooW') && keys.privKey) {
        const privKeyBytes = Buffer.from(keys.privKey, 'base64');

        // Verify key integrity
        if (!verifyKeyIntegrity(privKeyBytes, keys.id)) {
          const error = 'Peer ID mismatch in keys.json - key may be corrupted';
          if (isProduction) {
            throw new Error(`${error}. Manual intervention required.`);
          }
          console.log(`⚠ ${error}, regenerating...`);
        } else {
          // Valid keys - load and use
          privateKey = privateKeyFromProtobuf(privKeyBytes);
          peerId = peerIdFromPrivateKey(privateKey);
          console.log('Loaded Ed25519 keys from keys.json');
          console.log('Peer ID:', peerId.toString());
          return;
        }
      } else {
        const error = 'Found keys.json with RSA/invalid format';
        if (isProduction) {
          throw new Error(`${error}. Run 'pnpm setup-keys' to generate Ed25519 keys.`);
        }
        console.log(`⚠ ${error}, regenerating Ed25519 keys...`);
      }
    } catch (err) {
      if (err.message.includes('Manual intervention') || err.message.includes('Run ')) {
        throw err; // Re-throw production errors
      }
      if (isProduction) {
        throw new Error(`Failed to load keys.json: ${err.message}. Manual intervention required.`);
      }
      console.log('⚠ Error reading keys.json, generating new keys:', err.message);
    }
  } else if (isProduction) {
    throw new Error("No keys.json found. Run 'pnpm setup-keys' before starting in production.");
  }

  // Development only: Generate new Ed25519 keys
  // Acquire lock to prevent race with setup-keys script
  if (!acquireLock()) {
    throw new Error('Another process is setting up keys. Please wait and try again.');
  }

  try {
    console.log('Generating new Ed25519 keys...');
    privateKey = await generateKeyPair('Ed25519');
    peerId = peerIdFromPrivateKey(privateKey);

    // Save to keys.json for persistence
    const newKeys = {
      id: peerId.toString(),
      privKey: Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'),
    };

    writeFileSecurely(KEYS_PATH, JSON.stringify(newKeys, null, 2));
    console.log('Saved new Ed25519 keys to keys.json');
    console.log('Peer ID:', peerId.toString());
    console.log('⚠ WARNING: Do not commit keys.json to version control!');
  } finally {
    releaseLock();
  }
}

await loadOrGenerateKeys();

const limits = readRelayLimits();

// The cross-field invariants the limit comments assert are checked against the RESOLVED set,
// before the node is built — not just against the defaults in a unit test. A deployment that
// sets one variable without the others gets told which ceiling is actually in force instead
// of discovering it under load.
for (const problem of validateRelayLimits(limits)) {
  console.warn(`⚠ Relay limit misconfiguration: ${problem}`);
}

// The gater is constructed before the node exists and reads it lazily; see
// createReservationGater. Both handles are `let … = null` rather than a forward reference to
// the `const server` below: createLibp2p starts listening before it returns, so a reservation
// arriving in that window would hit the temporal dead zone and throw a ReferenceError inside
// the gater — which circuit-relay-v2 awaits (server/index.js:123), turning a fail-open into an
// unhandled rejection. A null both callers already handle is the correct behaviour there.
let node = null;
let relayService = null;
const denyInboundRelayReservation = createReservationGater({
  getNode: () => node,
  getRelayService: () => relayService,
  reservationsPerHost: limits.reservationsPerHost,
  onDeny: (host, peerId) => {
    console.warn(
      `⚠ Reservation denied: ${host} already holds ${limits.reservationsPerHost} reservations (peer ${peerId})`
    );
  },
});

const server = await createLibp2p({
  privateKey,
  addresses: {
    listen: [`/ip4/0.0.0.0/tcp/${RELAY_PORT}/ws`],
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionManager: {
    // Must stay above the reservation ceiling: every reservation is backed by a live
    // connection, so a lower value would cap reservations regardless of maxReservations.
    maxConnections: limits.maxConnections,
    // Per-host connection *rate* limit (libp2p default 5/sec). Stated explicitly because it
    // is the first line against connection-churn floods, and a silent upstream default
    // change would be easy to miss.
    inboundConnectionThreshold: 5,
  },
  // circuit-relay-v2 has no per-peer or per-IP reservation option, but it consults the
  // connection gater immediately before granting a reservation. This is what stops one host
  // from taking every slot — the failure mode that takes P2P registration dark for victims
  // who have no other way to register.
  connectionGater: {
    denyInboundRelayReservation,
  },
  services: {
    identify: identify(),
    ping: ping(), // Enables keep-alive pings from clients
    dcutr: dcutr(), // Enables direct connection upgrade through relay
    relay: circuitRelayServer({
      // hopTimeout controls individual HOP relay request timeouts (default: 30s).
      // Set to 60s to allow more time for slow network handshakes.
      // Note: This is separate from the app-level grace period (1-4 min) which is
      // maintained by the ping/keepalive service, not by extending this timeout.
      hopTimeout: 60_000,
      reservations: {
        maxReservations: limits.maxReservations,
        reservationTtl: limits.reservationTtlMs,
        // Circuit relay v2 caps each relayed CONNECTION independently of the reservation.
        // The libp2p defaults are 2 minutes and 128 KiB, and the connection is torn down when
        // either is hit — pings do NOT reset them. Two minutes is shorter than our 1-4 minute
        // randomized grace period, so a P2P registration that waits out a long grace period
        // would lose its relayed connection mid-flow, right before the registration signature
        // needs to be sent.
        //
        // The duration limit tracks reservationTtl and comfortably covers the worst-case grace
        // period plus the registration window. The data limit is raised to 1 MiB — signatures
        // and batch payloads are small, so this is headroom, not an expected volume.
        defaultDurationLimit: limits.reservationTtlMs,
        defaultDataLimit: 1024n * 1024n, // 1 MiB (default: 128 KiB)
      },
    }),
  },
});

node = server;
relayService = server.services.relay;

console.log(
  'Relay listening on multiaddr(s): ',
  server.getMultiaddrs().map((ma) => ma.toString())
);

// Surfaced at startup so a misconfigured deployment is visible in the logs rather than only
// discoverable by exhausting it.
console.log(
  `Reservation limits: ${limits.maxReservations} total, ${limits.reservationsPerHost} per host, ` +
    `TTL ${Math.round(limits.reservationTtlMs / 60000)}m, max ${limits.maxConnections} connections`
);

// Print relay info for development
const wsMultiaddr = server.getMultiaddrs().find((ma) => ma.toString().includes('/ws/'));
if (!wsMultiaddr) {
  console.warn('⚠ No WebSocket transport configured - browser clients cannot connect');
} else {
  console.log(`\n📋 Relay multiaddr: ${wsMultiaddr.toString()}`);
  if (!isProduction) {
    console.log('   To update frontend config, run: pnpm relay:setup\n');
  }
}

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

const isProduction = process.env.NODE_ENV === 'production';

let peerId;
let privateKey;

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

const server = await createLibp2p({
  privateKey,
  addresses: {
    listen: [`/ip4/0.0.0.0/tcp/${RELAY_PORT}/ws`],
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionManager: {
    maxConnections: 100,
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
        maxReservations: 15,
        reservationTtl: 30 * 60 * 1000, // 30 minutes
      },
    }),
  },
});

console.log(
  'Relay listening on multiaddr(s): ',
  server.getMultiaddrs().map((ma) => ma.toString())
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

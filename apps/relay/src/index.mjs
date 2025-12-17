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
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysPath = path.resolve(__dirname, '../keys.json');

let peerId;
let privateKey;

/**
 * Load or generate Ed25519 keys for stable peer ID across restarts.
 *
 * libp2p 3.x uses Ed25519 keys (peer IDs start with "12D3KooW...").
 * Old RSA keys (peer IDs start with "Qm...") are not compatible.
 */
async function loadOrGenerateKeys() {
  if (fs.existsSync(keysPath)) {
    try {
      const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

      // Check if this is Ed25519 format (12D3KooW prefix)
      if (keys.id?.startsWith('12D3KooW') && keys.privKey) {
        // Decode base64 private key and reconstruct peer ID
        const privKeyBytes = Buffer.from(keys.privKey, 'base64');
        privateKey = privateKeyFromProtobuf(privKeyBytes);
        peerId = peerIdFromPrivateKey(privateKey);

        console.log('Loaded Ed25519 keys from keys.json');
        console.log('Peer ID:', peerId.toString());
        return;
      } else {
        console.log('Found keys.json with RSA/invalid format, regenerating Ed25519 keys...');
      }
    } catch (err) {
      console.log('Error reading keys.json, generating new keys:', err.message);
    }
  }

  // Generate new Ed25519 keys
  console.log('Generating new Ed25519 keys...');
  privateKey = await generateKeyPair('Ed25519');
  peerId = peerIdFromPrivateKey(privateKey);

  // Save to keys.json for persistence
  const newKeys = {
    id: peerId.toString(),
    privKey: Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'),
  };

  fs.writeFileSync(keysPath, JSON.stringify(newKeys, null, 2));
  console.log('Saved new Ed25519 keys to keys.json');
  console.log('Peer ID:', peerId.toString());
}

await loadOrGenerateKeys();

const server = await createLibp2p({
  privateKey,
  addresses: {
    listen: ['/ip4/0.0.0.0/tcp/12312/ws'],
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

// Print the multiaddr for frontend configuration
const wsMultiaddr = server.getMultiaddrs().find(ma => ma.toString().includes('/ws/'));
if (wsMultiaddr) {
  console.log('\n=== Frontend Configuration ===');
  console.log('Update apps/web/src/lib/p2p/types.ts with:');
  console.log(`multiaddr: '${wsMultiaddr.toString()}'`);
  console.log('==============================\n');
}

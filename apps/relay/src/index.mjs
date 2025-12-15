import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p } from 'libp2p';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import * as PeerIdFactory from '@libp2p/peer-id-factory';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let keys;
let peerId;

// in order to maintain the same PeerId across restarts, you need have keys.json defined
const keysPath = path.resolve(__dirname, '../keys.json');
if (fs.existsSync(keysPath)) {
  keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

  // Check if id.privkey is null or undefined
  if (!keys.id || !keys.privKey || !keys.pubKey) {
    throw new Error('one of id, privKey, pubKey not found or null in keys.json');
  }

  peerId = await PeerIdFactory.createFromJSON({
    id: keys.id,
    privKey: keys.privKey,
    pubKey: keys.pubKey,
  });
}

const server = await createLibp2p({
  peerId,
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

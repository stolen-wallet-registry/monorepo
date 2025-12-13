import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
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
    relay: circuitRelayServer({
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

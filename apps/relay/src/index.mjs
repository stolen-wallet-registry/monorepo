import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { mplex } from '@libp2p/mplex';
import { webSockets } from '@libp2p/websockets';
import * as filters from '@libp2p/websockets/filters';
import { createLibp2p } from 'libp2p';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { keychain } from '@libp2p/keychain';
import { LevelDatastore } from 'datastore-level'
import { loadOrCreateSelfKey } from '@libp2p/config'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let keys

// in order to maintain the same PeerId across restarts, you need have keys.json defined
// TODO: from upgrading libp2p:
//   privkey and such is outdated but not removing it right now -- the private key is stored in the datastore now
//   only the password is used now -- maybe will clean it up later...
//   see:
//   https://github.com/libp2p/js-libp2p/blob/main/doc/migrations/v0.46-v1.0.0.md#keeping-the-same-peerid-after-a-restart
//   https://github.com/libp2p/js-libp2p/blob/7caee9f03c19e53a19b65d3b81cfaad025edff92/packages/config/README.md?plain=1#L43
const keysPath = path.resolve(__dirname, '../keys.json')
if (fs.existsSync(keysPath)) {
  keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  if (!keys.id || !keys.privKey || !keys.pubKey) {
    throw new Error('one of id, privKey, pubKey not found or null in keys.json');
  }
}

const datastorePath = path.resolve(__dirname, '../.data/relay-datastore')
const datastore = new LevelDatastore(datastorePath)
await datastore.open()

const keychainInit = {
  pass: keys.password
}

const privateKey = await loadOrCreateSelfKey(datastore, keychainInit)

const server = await createLibp2p({
  privateKey,
	addresses: {
		listen: ['/ip4/0.0.0.0/tcp/12312/ws']
	},
	transports: [
		webSockets({
			filter: filters.all,
		}),
	],
	connectionEncryption: [noise()],
	streamMuxers: [yamux(), mplex()],
	connectionManager: {
		maxConnections: Infinity,
		minConnections: 0,
	},
	services: {
    keychain: keychain(keychainInit),
		identify: identify(),
		relay: circuitRelayServer({
			reservations: {
				// this allows us to reload the browser repeatedly without exhausting
				// the relay's reservation slots - in production you should specify a
				// limit here or accept the default of 15
				maxReservations: Infinity,
			},
		}),
	},
});

console.log(
	'Relay listening on multiaddr(s): ',
	server.getMultiaddrs().map((ma) => ma.toString())
);

#!/usr/bin/env node
/**
 * Setup script for generating stable Ed25519 keys for the relay server.
 *
 * Usage: node scripts/setup-keys.mjs
 *
 * This script:
 * 1. Generates Ed25519 keys (or regenerates if RSA/invalid keys exist)
 * 2. Saves them to keys.json
 * 3. Prints the multiaddr for frontend configuration
 */

import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysPath = path.resolve(__dirname, '../keys.json');

async function setupKeys() {
  console.log('=== SWR Relay Key Setup ===\n');

  // Check for existing keys
  if (fs.existsSync(keysPath)) {
    try {
      const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      if (keys.id?.startsWith('12D3KooW')) {
        console.log('✓ Valid Ed25519 keys already exist');
        console.log(`  Peer ID: ${keys.id}\n`);
        printMultiaddr(keys.id);
        return;
      }
      console.log('⚠ Found keys.json with RSA/invalid format, regenerating...\n');
    } catch (err) {
      console.log('⚠ Error reading keys.json, generating new keys...\n');
    }
  } else {
    console.log('→ No keys.json found, generating new Ed25519 keys...\n');
  }

  // Generate new Ed25519 keys
  const privateKey = await generateKeyPair('Ed25519');
  const peerId = peerIdFromPrivateKey(privateKey);

  const newKeys = {
    id: peerId.toString(),
    privKey: Buffer.from(privateKeyToProtobuf(privateKey)).toString('base64'),
  };

  fs.writeFileSync(keysPath, JSON.stringify(newKeys, null, 2));

  console.log('✓ Generated new Ed25519 keys');
  console.log(`  Peer ID: ${peerId.toString()}\n`);
  console.log('  Saved to: apps/relay/keys.json\n');

  printMultiaddr(peerId.toString());
}

function printMultiaddr(peerId) {
  const multiaddr = `/ip4/127.0.0.1/tcp/12312/ws/p2p/${peerId}`;

  console.log('=== Frontend Configuration ===\n');
  console.log('Option 1: Update apps/web/src/lib/p2p/types.ts line ~221');
  console.log(`  multiaddr: '${multiaddr}',\n`);
  console.log('Option 2: Set environment variable');
  console.log(`  VITE_RELAY_MULTIADDR=${multiaddr}\n`);
  console.log('==============================\n');
}

setupKeys().catch(console.error);

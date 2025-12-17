#!/usr/bin/env node
/**
 * Setup script for generating stable Ed25519 keys for the relay server.
 *
 * Usage: node scripts/setup-keys.mjs
 *
 * This script:
 * 1. Generates Ed25519 keys (or regenerates if RSA/invalid keys exist)
 * 2. Saves them to keys.json with restrictive permissions (0600)
 * 3. Prints the multiaddr for frontend configuration
 *
 * SECURITY WARNING:
 * - keys.json contains private key material - NEVER commit to version control
 * - File-based keys are for LOCAL/DEV use only
 * - In production, use RELAY_PRIVATE_KEY environment variable (base64)
 */

import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import fs from 'fs';

import { KEYS_PATH, RELAY_HOST, RELAY_PORT } from '../src/config.mjs';
import { verifyKeyIntegrity, writeFileSecurely, acquireLock, releaseLock } from '../src/key-utils.mjs';

async function setupKeys() {
  console.log('=== SWR Relay Key Setup ===\n');

  // Acquire lock (handles stale lock detection automatically)
  if (!acquireLock()) {
    console.error('⚠ Another process is currently accessing keys');
    console.error('  Wait for it to complete or check for stale processes');
    process.exit(1);
  }

  try {
    // Check for environment variable override
    if (process.env.RELAY_PRIVATE_KEY) {
      console.log('ℹ RELAY_PRIVATE_KEY environment variable is set');
      console.log('  The relay will use this instead of keys.json\n');
    }

    // Check for existing keys
    if (fs.existsSync(KEYS_PATH)) {
      try {
        const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));

        if (keys.id?.startsWith('12D3KooW') && keys.privKey) {
          // Verify key integrity
          const privKeyBytes = Buffer.from(keys.privKey, 'base64');

          if (verifyKeyIntegrity(privKeyBytes, keys.id)) {
            console.log('✓ Valid Ed25519 keys already exist');
            console.log(`  Peer ID: ${keys.id}\n`);
            printMultiaddr(keys.id);
            return;
          } else {
            console.log('⚠ Peer ID mismatch in keys.json, regenerating...\n');
          }
        } else {
          console.log('⚠ Found keys.json with RSA/invalid format, regenerating...\n');
        }
      } catch (err) {
        console.log('⚠ Error reading keys.json, generating new keys:', err.message, '\n');
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

    // Write securely with atomic rename and restrictive permissions
    writeFileSecurely(KEYS_PATH, JSON.stringify(newKeys, null, 2));

    console.log('✓ Generated new Ed25519 keys');
    console.log(`  Peer ID: ${peerId.toString()}\n`);
    console.log('  Saved to: apps/relay/keys.json (mode 0600)\n');
    console.log('  ⚠ WARNING: Do not commit keys.json to version control!\n');

    printMultiaddr(peerId.toString());
  } finally {
    releaseLock();
  }
}

function printMultiaddr(peerId) {
  const multiaddr = `/ip4/${RELAY_HOST}/tcp/${RELAY_PORT}/ws/p2p/${peerId}`;

  console.log('=== Frontend Configuration ===\n');
  console.log('Option 1: Update the development relay multiaddr in:');
  console.log('  apps/web/src/lib/p2p/types.ts (RELAY_SERVERS.development)');
  console.log(`  multiaddr: '${multiaddr}',\n`);
  console.log('Option 2: Set environment variable in apps/web/.env.local:');
  console.log(`  VITE_RELAY_MULTIADDR=${multiaddr}\n`);
  console.log('==============================\n');
}

setupKeys().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});

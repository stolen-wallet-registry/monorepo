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

import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { KEYS_PATH, KEYS_LOCK_PATH } from '../src/config.mjs';

/**
 * Verify that a private key produces the expected peer ID.
 */
function verifyKeyIntegrity(privKeyBytes, expectedPeerId) {
  try {
    const privKey = privateKeyFromProtobuf(privKeyBytes);
    const derivedPeerId = peerIdFromPrivateKey(privKey);
    return derivedPeerId.toString() === expectedPeerId;
  } catch {
    return false;
  }
}

/**
 * Write file atomically with restrictive permissions.
 * Writes to temp file first, then renames to prevent corruption.
 */
function writeFileSecurely(filePath, content) {
  const tempPath = filePath + '.tmp.' + process.pid;

  // Write to temp file
  fs.writeFileSync(tempPath, content, { mode: 0o600 });

  // Atomic rename
  fs.renameSync(tempPath, filePath);

  // Ensure permissions on final file (some systems don't preserve mode on rename)
  if (os.platform() !== 'win32') {
    fs.chmodSync(filePath, 0o600);
  }
}

async function setupKeys() {
  console.log('=== SWR Relay Key Setup ===\n');

  // Check for lock file (prevent race with relay startup)
  if (fs.existsSync(KEYS_LOCK_PATH)) {
    console.error('⚠ Lock file exists - another process may be accessing keys');
    console.error('  If this is stale, remove:', KEYS_LOCK_PATH);
    process.exit(1);
  }

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
}

function printMultiaddr(peerId) {
  const multiaddr = `/ip4/127.0.0.1/tcp/12312/ws/p2p/${peerId}`;

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

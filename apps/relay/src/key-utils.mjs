/**
 * Shared key utilities for the relay server.
 *
 * Used by both the relay server (index.mjs) and setup script (setup-keys.mjs)
 * to ensure consistent key handling.
 */

import { privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import fs from 'fs';
import os from 'os';

import { KEYS_LOCK_PATH } from './config.mjs';

/**
 * Verify that a private key produces the expected peer ID.
 * Used to detect key corruption or tampering.
 *
 * @param {Uint8Array} privKeyBytes - Private key in protobuf format
 * @param {string} expectedPeerId - Expected peer ID string
 * @returns {boolean} True if key produces expected peer ID
 */
export function verifyKeyIntegrity(privKeyBytes, expectedPeerId) {
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
 * Writes to temp file first, then renames to prevent corruption on crash.
 *
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 */
export function writeFileSecurely(filePath, content) {
  const tempPath = filePath + '.tmp.' + process.pid;

  // Write to temp file with restrictive permissions
  fs.writeFileSync(tempPath, content, { mode: 0o600 });

  // Atomic rename
  fs.renameSync(tempPath, filePath);

  // Ensure permissions on final file (some systems don't preserve mode on rename)
  if (os.platform() !== 'win32') {
    fs.chmodSync(filePath, 0o600);
  }
}

/**
 * Check if a process with the given PID is still running.
 *
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process is running
 */
function isProcessRunning(pid) {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire a file lock for key operations.
 * Handles stale locks by checking if the locking process is still running.
 *
 * @returns {boolean} True if lock acquired, false if another process holds it
 */
export function acquireLock() {
  // Check for existing lock
  if (fs.existsSync(KEYS_LOCK_PATH)) {
    try {
      const lockContent = fs.readFileSync(KEYS_LOCK_PATH, 'utf8').trim();
      const lockPid = parseInt(lockContent, 10);

      if (!isNaN(lockPid) && isProcessRunning(lockPid)) {
        // Lock is held by a running process
        return false;
      }

      // Lock is stale (process no longer running or invalid PID)
      console.log(`Removing stale lock file (PID ${lockPid || 'unknown'} not running)`);
      try {
        fs.unlinkSync(KEYS_LOCK_PATH);
      } catch (unlinkErr) {
        // If we can't remove the stale lock, we can't proceed
        console.error('Failed to remove stale lock:', unlinkErr.message);
        return false;
      }
    } catch {
      // Lock file exists but can't be read - treat as stale
      console.log('Removing unreadable lock file');
      try {
        fs.unlinkSync(KEYS_LOCK_PATH);
      } catch {
        return false;
      }
    }
  }

  // Try to create lock file
  try {
    fs.writeFileSync(KEYS_LOCK_PATH, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    // Another process created the lock between our check and write
    return false;
  }
}

/**
 * Release the file lock.
 */
export function releaseLock() {
  try {
    fs.unlinkSync(KEYS_LOCK_PATH);
  } catch {
    // Ignore - lock may not exist or already removed
  }
}

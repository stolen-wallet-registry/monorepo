/**
 * Shared configuration for the relay server.
 *
 * SECURITY WARNING:
 * - keys.json contains private key material - NEVER commit to version control
 * - File-based keys are for LOCAL/DEV use only
 * - In production, consider environment variable: RELAY_PRIVATE_KEY (base64)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to persistent Ed25519 keys file */
export const KEYS_PATH = path.resolve(__dirname, '../keys.json');

/** Lock file path for preventing race conditions */
export const KEYS_LOCK_PATH = KEYS_PATH + '.lock';

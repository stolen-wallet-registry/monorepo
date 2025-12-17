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

// ============================================================================
// Network Configuration
// ============================================================================

/** Host for relay server (use 0.0.0.0 for listen, 127.0.0.1 for local multiaddr) */
export const RELAY_HOST = process.env.RELAY_HOST || '127.0.0.1';

/** Port for relay server WebSocket transport */
export const RELAY_PORT = parseInt(process.env.RELAY_PORT || '12312', 10);

// ============================================================================
// Key Storage Configuration
// ============================================================================

/** Path to persistent Ed25519 keys file */
export const KEYS_PATH = path.resolve(__dirname, '../keys.json');

/** Lock file path for preventing race conditions */
export const KEYS_LOCK_PATH = KEYS_PATH + '.lock';

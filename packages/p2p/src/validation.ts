/**
 * P2P stream data validation utilities.
 */

import { ParsedStreamDataSchema, type ParsedStreamData } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Stream Data Size Limits
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum size of incoming P2P stream data (100KB) */
export const MAX_STREAM_SIZE_BYTES = 100 * 1024;

/**
 * Dangerous JSON keys that could enable prototype pollution attacks.
 * These are stripped during parsing.
 */
export const DANGEROUS_JSON_KEYS = ['__proto__', 'constructor', 'prototype'];

// ═══════════════════════════════════════════════════════════════════════════
// Validation Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Safe JSON parse that strips dangerous keys to prevent prototype pollution.
 */
export function safeJsonParse(jsonString: string): unknown {
  return JSON.parse(jsonString, (key, value) => {
    if (DANGEROUS_JSON_KEYS.includes(key)) {
      return undefined;
    }
    return value;
  });
}

/**
 * Parse and validate P2P stream data.
 *
 * @param data - Raw data to validate (string or parsed object)
 * @returns Validated ParsedStreamData or null if invalid
 */
export function validateStreamData(data: unknown): ParsedStreamData | null {
  try {
    // If string, parse it safely first
    const parsed = typeof data === 'string' ? safeJsonParse(data) : data;

    // Validate against schema
    const result = ParsedStreamDataSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if data size is within acceptable limits.
 *
 * @param data - String data to check
 * @returns true if within size limit
 */
export function isWithinSizeLimit(data: string): boolean {
  return new TextEncoder().encode(data).length <= MAX_STREAM_SIZE_BYTES;
}

/**
 * Extract peer ID from a multiaddr string.
 * Returns the peer ID portion after /p2p/ or null if not found.
 *
 * Handles both standard and circuit relay multiaddrs:
 * - `/ip4/127.0.0.1/tcp/4001/p2p/QmPeerId` → `QmPeerId`
 * - `/dns4/relay.com/p2p/QmRelay/p2p-circuit/p2p/QmTarget` → `QmTarget` (target)
 * - `/dns4/relay.com/p2p/QmRelay/p2p-circuit` → `QmRelay` (relay server)
 */
export function extractPeerIdFromMultiaddr(multiaddr: string): string | null {
  // Try final /p2p/ segment first (for circuit relay target peer IDs)
  const finalMatch = multiaddr.match(/\/p2p\/([^/]+)$/);
  if (finalMatch) {
    return finalMatch[1];
  }
  // Fall back to first /p2p/ segment (for relay addresses ending in /p2p-circuit)
  const firstMatch = multiaddr.match(/\/p2p\/([^/]+)/);
  return firstMatch ? firstMatch[1] : null;
}

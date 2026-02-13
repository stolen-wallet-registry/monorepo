/**
 * Log formatting utilities
 * - Safe stringification (circular refs, BigInt, truncation)
 * - Sensitive data redaction
 * - Ethereum address redaction (using viem)
 * - Console output formatting
 */

import { isAddress } from 'viem';
import type { LogConfig, LogEntry, LogLevel } from './types';

// Keys that should be redacted from log output
const SENSITIVE_KEYS = [
  'privatekey',
  'password',
  'secret',
  'mnemonic',
  'seed',
  'apikey',
  'token',
  'auth',
  'credential',
];

// Max length for stringified output before truncation
const MAX_STRING_LENGTH = 5000;

/**
 * Redact an Ethereum address, keeping last 4 characters for debugging.
 * Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 → 0x...bEb0
 *
 * Defensively handles invalid inputs to prevent data leakage.
 */
export function redactAddress(address: unknown): string {
  // Handle null/undefined
  if (address == null) {
    return '0x...[redacted]';
  }

  // Must be a string
  if (typeof address !== 'string') {
    return '0x...[redacted]';
  }

  const trimmed = address.trim();

  // Validate it looks like an ETH address (0x + at least 4 chars for safe slicing)
  if (!trimmed.startsWith('0x') || trimmed.length < 6) {
    return '0x...[redacted]';
  }

  return `0x...${trimmed.slice(-4)}`;
}

export interface SafeStringifyOptions {
  maxLength?: number;
  redactAddresses?: boolean;
}

/**
 * Safely stringify any value, handling:
 * - Circular references
 * - BigInt values
 * - Sensitive data redaction
 * - Ethereum address redaction (when enabled)
 * - Length truncation
 */
export function safeStringify(obj: unknown, options: SafeStringifyOptions = {}): string {
  const { maxLength = MAX_STRING_LENGTH, redactAddresses = false } = options;
  const seen = new WeakSet();

  try {
    const result = JSON.stringify(
      obj,
      (key, value) => {
        // Redact sensitive data based on key name
        if (key && SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
          return '[REDACTED]';
        }

        // Redact Ethereum addresses when enabled
        if (redactAddresses && typeof value === 'string' && isAddress(value)) {
          return redactAddress(value);
        }

        // Handle circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }

        // Handle BigInt
        if (typeof value === 'bigint') {
          return value.toString();
        }

        // Handle Error objects
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            // stack intentionally omitted for clean LLM output
          };
        }

        return value;
      },
      2
    );

    // Truncate if too long
    if (result.length > maxLength) {
      return result.slice(0, maxLength) + '...[truncated]';
    }

    return result;
  } catch {
    return '[Unable to stringify]';
  }
}

/**
 * Format log entry for console output
 * Returns array of parts to be joined
 */
export function formatConsolePrefix(entry: LogEntry, config: LogConfig): string {
  const parts: string[] = [];

  if (config.includeTimestamp) {
    // Format: HH:MM:SS.mmm
    parts.push(`[${entry.timestamp.toISOString().slice(11, 23)}]`);
  }

  parts.push(`[${entry.category.toUpperCase()}]`);

  return parts.join(' ');
}

// Console colors for different log levels
export const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'color: #888888', // Gray
  info: 'color: #2196F3', // Blue
  warn: 'color: #FF9800', // Orange
  error: 'color: #F44336', // Red
};

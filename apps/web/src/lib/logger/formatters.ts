/**
 * Log formatting utilities
 * - Safe stringification (circular refs, BigInt, truncation)
 * - Sensitive data redaction
 * - Console output formatting
 */

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
 * Safely stringify any value, handling:
 * - Circular references
 * - BigInt values
 * - Sensitive data redaction
 * - Length truncation
 */
export function safeStringify(obj: unknown, maxLength = MAX_STRING_LENGTH): string {
  const seen = new WeakSet();

  try {
    const result = JSON.stringify(
      obj,
      (key, value) => {
        // Redact sensitive data based on key name
        if (key && SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
          return '[REDACTED]';
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

// Background colors for category tags
export const CATEGORY_STYLES: Record<LogLevel, string> = {
  debug: 'color: #888888; font-weight: normal',
  info: 'color: #2196F3; font-weight: bold',
  warn: 'color: #FF9800; font-weight: bold',
  error: 'color: #F44336; font-weight: bold',
};

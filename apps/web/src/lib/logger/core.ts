/**
 * Core logger implementation
 * - Configuration management
 * - Log filtering by level and category
 * - Console output emission
 */

import type {
  CategoryLogger,
  LogCategory,
  LogConfig,
  LogConfigUpdate,
  LogEntry,
  LogLevel,
  Logger,
} from './types';
import { getDefaultConfig, LOG_LEVEL_PRIORITY } from './config';
import { isAddress } from 'viem';
import { formatConsolePrefix, LEVEL_COLORS, redactAddress, safeStringify } from './formatters';

// Current configuration (mutable, can be updated at runtime)
let currentConfig: LogConfig = getDefaultConfig();

/**
 * Update logger configuration
 * Merges provided config with current config
 */
export function configureLogger(config: LogConfigUpdate): void {
  currentConfig = {
    ...currentConfig,
    ...(config.enabled !== undefined && { enabled: config.enabled }),
    ...(config.level !== undefined && { level: config.level }),
    ...(config.includeTimestamp !== undefined && { includeTimestamp: config.includeTimestamp }),
    ...(config.includeStackTrace !== undefined && { includeStackTrace: config.includeStackTrace }),
    ...(config.redactAddresses !== undefined && { redactAddresses: config.redactAddresses }),
    // Deep merge categories if provided
    categories: config.categories
      ? { ...currentConfig.categories, ...config.categories }
      : currentConfig.categories,
  };
}

/**
 * Reset logger to default configuration for current environment
 */
export function resetLoggerConfig(): void {
  currentConfig = getDefaultConfig();
}

/**
 * Get current logger configuration (for testing/debugging)
 */
export function getLoggerConfig(): LogConfig {
  return { ...currentConfig };
}

/**
 * Check if a log should be emitted based on level and category
 */
export function shouldLog(level: LogLevel, category: LogCategory): boolean {
  if (!currentConfig.enabled) return false;
  if (!currentConfig.categories[category]) return false;
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentConfig.level];
}

/**
 * Emit a log entry to the console
 */
export function emitLog(entry: LogEntry): void {
  if (!shouldLog(entry.level, entry.category)) return;

  const prefix = formatConsolePrefix(entry, currentConfig);
  const style = LEVEL_COLORS[entry.level];

  // Build console arguments
  const args: unknown[] = [`%c${prefix}`, style, entry.message];

  // Add data if present
  if (entry.data !== undefined) {
    // For objects, stringify them nicely (with address redaction if enabled)
    if (typeof entry.data === 'object' && entry.data !== null) {
      args.push(
        '\n' + safeStringify(entry.data, { redactAddresses: currentConfig.redactAddresses })
      );
    } else if (
      currentConfig.redactAddresses &&
      typeof entry.data === 'string' &&
      isAddress(entry.data)
    ) {
      // Redact string addresses when redactAddresses config is enabled
      args.push(redactAddress(entry.data));
    } else {
      args.push(entry.data);
    }
  }

  // Add error if present (without stack trace for clean output)
  if (entry.error) {
    args.push(`\nError: ${entry.error.message}`);
  }

  // Call appropriate console method (info maps to console.log)
  const consoleMethod = entry.level === 'info' ? 'log' : entry.level;
  console[consoleMethod](...args);
}

/**
 * Create a logger for a specific category
 */
function createCategoryLogger(category: LogCategory): CategoryLogger {
  return {
    debug: (message: string, data?: unknown) =>
      emitLog({ level: 'debug', category, message, data, timestamp: new Date() }),

    info: (message: string, data?: unknown) =>
      emitLog({ level: 'info', category, message, data, timestamp: new Date() }),

    warn: (message: string, data?: unknown) =>
      emitLog({ level: 'warn', category, message, data, timestamp: new Date() }),

    error: (message: string, data?: unknown, error?: Error) =>
      emitLog({ level: 'error', category, message, data, timestamp: new Date(), error }),
  };
}

/**
 * Main logger object with category-based logging
 *
 * Usage:
 *   logger.wallet.info('Connected', { address, chainId });
 *   logger.registration.debug('Step transition', { from, to });
 *   logger.signature.error('Signing failed', { type }, error);
 */
export const logger: Logger = {
  wallet: createCategoryLogger('wallet'),
  contract: createCategoryLogger('contract'),
  signature: createCategoryLogger('signature'),
  registration: createCategoryLogger('registration'),
  p2p: createCategoryLogger('p2p'),
  store: createCategoryLogger('store'),
  ui: createCategoryLogger('ui'),
};

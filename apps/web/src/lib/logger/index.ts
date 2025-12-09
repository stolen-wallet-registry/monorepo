/**
 * Log-Driven Development Logger for Stolen Wallet Registry
 *
 * Category-based logging designed for LLM-assisted debugging.
 * - Environment-aware (auto-configures for dev/staging/production/test)
 * - Category filtering to focus on specific app functionality
 * - Clean console output (no stack traces) for easy copy-paste
 * - Sensitive data redaction (privateKey, mnemonic, etc.)
 *
 * @example
 * ```typescript
 * import { logger, configureLogger } from '@/lib/logger';
 *
 * // Basic usage
 * logger.wallet.info('Connected', { address, chainId });
 * logger.registration.debug('Step transition', { from, to });
 * logger.signature.error('Signing failed', { type }, error);
 *
 * // Configure categories
 * configureLogger({
 *   categories: { wallet: true, store: false }
 * });
 * ```
 */

// Main exports
export { logger, configureLogger, resetLoggerConfig, getLoggerConfig } from './core';

// Types for consumers who need them
export type {
  LogLevel,
  LogCategory,
  LogConfig,
  LogConfigUpdate,
  LogEntry,
  CategoryLogger,
  Logger,
} from './types';

// Config utilities for testing
export { getEnvironment, DEFAULT_CONFIGS } from './config';

// Formatters for testing
export { safeStringify } from './formatters';

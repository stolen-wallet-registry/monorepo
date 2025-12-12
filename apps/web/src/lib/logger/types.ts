/**
 * Logger type definitions for Stolen Wallet Registry
 * Category-based logging for development and staging environments
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'wallet' // Wallet connection, disconnection, chain switching
  | 'contract' // Contract reads, writes, transaction receipts
  | 'signature' // EIP-712 signing, storage, validation
  | 'registration' // Flow step transitions, ack/reg phases
  | 'p2p' // libp2p node lifecycle, peer connections
  | 'store' // Zustand state changes (noisy, off by default)
  | 'ui'; // Component lifecycle, user interactions

export interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  categories: Record<LogCategory, boolean>;
  includeTimestamp: boolean;
  includeStackTrace: boolean;
  /** Redact Ethereum addresses in log output (recommended for staging/production) */
  redactAddresses: boolean;
}

// For configureLogger, categories can be partial
export interface LogConfigUpdate {
  enabled?: boolean;
  level?: LogLevel;
  categories?: Partial<Record<LogCategory, boolean>>;
  includeTimestamp?: boolean;
  includeStackTrace?: boolean;
  redactAddresses?: boolean;
}

export interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
  timestamp: Date;
  error?: Error;
}

export type CategoryLogger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown, error?: Error) => void;
};

export type Logger = Record<LogCategory, CategoryLogger>;

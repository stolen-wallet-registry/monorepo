/**
 * Logger configuration and environment detection
 */

import type { LogConfig, LogLevel } from './types';

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export type Environment = 'development' | 'staging' | 'production' | 'test';

export function getEnvironment(): Environment {
  // Check for test environment first
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return 'test';
  }

  // Check Vite environment variables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteEnv = (import.meta as any).env;
  if (viteEnv) {
    const env = viteEnv.VITE_APP_ENV || viteEnv.MODE;
    if (env === 'staging') return 'staging';
    if (env === 'production') return 'production';
  }

  return 'development';
}

const ALL_CATEGORIES_ENABLED = {
  wallet: true,
  contract: true,
  signature: true,
  registration: true,
  p2p: true,
  store: true,
  ui: true,
} as const;

// Staging categories - no store/ui to prevent wallet address leaks in logs
const STAGING_CATEGORIES = {
  wallet: true,
  contract: true,
  signature: true,
  registration: true,
  p2p: true,
  store: false,
  ui: false,
} as const;

const ALL_CATEGORIES_DISABLED = {
  wallet: false,
  contract: false,
  signature: false,
  registration: false,
  p2p: false,
  store: false,
  ui: false,
} as const;

export const DEFAULT_CONFIGS: Record<Environment, LogConfig> = {
  development: {
    enabled: true,
    level: 'debug',
    categories: { ...ALL_CATEGORIES_ENABLED },
    includeTimestamp: true,
    includeStackTrace: false, // Clean output for LLM copy-paste
  },
  staging: {
    enabled: true,
    level: 'info',
    categories: { ...STAGING_CATEGORIES },
    includeTimestamp: true,
    includeStackTrace: false,
  },
  production: {
    enabled: false, // Disabled by default, can be turned on
    level: 'warn',
    categories: { ...ALL_CATEGORIES_DISABLED },
    includeTimestamp: true,
    includeStackTrace: false,
  },
  test: {
    enabled: false, // Disabled to keep test output clean
    level: 'error',
    categories: { ...ALL_CATEGORIES_DISABLED },
    includeTimestamp: false,
    includeStackTrace: false,
  },
};

export function getDefaultConfig(): LogConfig {
  const env = getEnvironment();
  return { ...DEFAULT_CONFIGS[env] };
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logger,
  configureLogger,
  resetLoggerConfig,
  getLoggerConfig,
  safeStringify,
} from './index';

// Enable all categories for testing
const TEST_CONFIG = {
  enabled: true,
  level: 'debug' as const,
  categories: {
    wallet: true,
    contract: true,
    signature: true,
    registration: true,
    p2p: true,
    store: true,
    ui: true,
  },
};

describe('logger', () => {
  beforeEach(() => {
    // Reset to known state before each test
    resetLoggerConfig();
    // Enable logger with all categories for tests
    configureLogger(TEST_CONFIG);
    // Spy on console methods
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('safeStringify', () => {
    it('handles simple objects', () => {
      const result = safeStringify({ a: 1, b: 'hello' });
      expect(result).toContain('"a": 1');
      expect(result).toContain('"b": "hello"');
    });

    it('handles circular references', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      const result = safeStringify(obj);
      expect(result).toContain('[Circular]');
      expect(() => safeStringify(obj)).not.toThrow();
    });

    it('handles BigInt values', () => {
      const result = safeStringify({ value: BigInt(123456789) });
      expect(result).toContain('123456789');
    });

    it('redacts sensitive data by key name', () => {
      const result = safeStringify({
        privateKey: '0x1234567890',
        address: '0xabc123',
        password: 'secret123',
        mnemonic: 'word1 word2 word3',
        apiKey: 'key-123',
      });

      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('0x1234567890');
      expect(result).not.toContain('secret123');
      expect(result).not.toContain('word1 word2 word3');
      expect(result).not.toContain('key-123');
      // Non-sensitive data should remain
      expect(result).toContain('0xabc123');
    });

    it('handles nested sensitive data', () => {
      const result = safeStringify({
        wallet: {
          privateKey: '0xsecret',
          address: '0xpublic',
        },
      });

      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('0xsecret');
      expect(result).toContain('0xpublic');
    });

    it('truncates long output', () => {
      const longArray = Array(1000).fill('x'.repeat(100));
      const result = safeStringify(longArray, 100);
      expect(result.length).toBeLessThanOrEqual(115); // 100 + '...[truncated]'
      expect(result).toContain('[truncated]');
    });

    it('handles Error objects', () => {
      const error = new Error('Something went wrong');
      const result = safeStringify(error);
      expect(result).toContain('Something went wrong');
      // Stack trace should not be included
      expect(result).not.toContain('at ');
    });

    it('handles null and undefined', () => {
      expect(safeStringify(null)).toBe('null');
      // undefined returns '[Unable to stringify]' because JSON.stringify(undefined) returns undefined
      // and our try block catches this case
      const result = safeStringify(undefined);
      expect(typeof result).toBe('string');
    });
  });

  describe('configuration', () => {
    it('starts with test config', () => {
      const config = getLoggerConfig();
      expect(config.enabled).toBe(true); // We enabled it in beforeEach
      expect(config.categories.wallet).toBe(true);
      expect(config.level).toBe('debug');
    });

    it('merges partial config updates', () => {
      configureLogger({ level: 'warn' });
      const config = getLoggerConfig();
      expect(config.level).toBe('warn');
      expect(config.enabled).toBe(true); // Other settings preserved
    });

    it('deep merges category updates', () => {
      configureLogger({ categories: { wallet: false } });
      const config = getLoggerConfig();
      expect(config.categories.wallet).toBe(false);
      expect(config.categories.contract).toBe(true); // Other categories preserved
    });

    it('can disable all logging', () => {
      configureLogger({ enabled: false });
      logger.wallet.info('test');
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('category filtering', () => {
    it('logs enabled categories', () => {
      configureLogger({ categories: { wallet: true } });
      logger.wallet.info('test message');
      expect(console.log).toHaveBeenCalled();
    });

    it('skips disabled categories', () => {
      configureLogger({ categories: { wallet: false } });
      logger.wallet.info('test message');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('filters independently per category', () => {
      configureLogger({
        categories: { wallet: true, contract: false },
      });

      logger.wallet.info('wallet message');
      logger.contract.info('contract message');

      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('log level filtering', () => {
    it('logs at or above configured level', () => {
      configureLogger({ level: 'warn' });

      logger.wallet.debug('debug');
      logger.wallet.info('info');
      logger.wallet.warn('warn');
      logger.wallet.error('error');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('debug level includes all logs', () => {
      configureLogger({ level: 'debug' });

      logger.wallet.debug('debug');
      logger.wallet.info('info');
      logger.wallet.warn('warn');
      logger.wallet.error('error');

      expect(console.debug).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('error level only includes errors', () => {
      configureLogger({ level: 'error' });

      logger.wallet.debug('debug');
      logger.wallet.info('info');
      logger.wallet.warn('warn');
      logger.wallet.error('error');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('all categories available', () => {
    it('has wallet category', () => {
      expect(logger.wallet).toBeDefined();
      expect(logger.wallet.info).toBeTypeOf('function');
    });

    it('has contract category', () => {
      expect(logger.contract).toBeDefined();
      expect(logger.contract.info).toBeTypeOf('function');
    });

    it('has signature category', () => {
      expect(logger.signature).toBeDefined();
      expect(logger.signature.info).toBeTypeOf('function');
    });

    it('has registration category', () => {
      expect(logger.registration).toBeDefined();
      expect(logger.registration.info).toBeTypeOf('function');
    });

    it('has p2p category', () => {
      expect(logger.p2p).toBeDefined();
      expect(logger.p2p.info).toBeTypeOf('function');
    });

    it('has store category', () => {
      expect(logger.store).toBeDefined();
      expect(logger.store.info).toBeTypeOf('function');
    });

    it('has ui category', () => {
      expect(logger.ui).toBeDefined();
      expect(logger.ui.info).toBeTypeOf('function');
    });
  });

  describe('log output', () => {
    it('includes category tag in output', () => {
      logger.wallet.info('test message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[WALLET]'),
        expect.any(String),
        'test message'
      );
    });

    it('includes data when provided', () => {
      logger.wallet.info('test', { foo: 'bar' });
      expect(console.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'test',
        expect.stringContaining('"foo": "bar"')
      );
    });

    it('handles error in error logs', () => {
      const error = new Error('test error');
      logger.wallet.error('failed', { detail: 'info' }, error);
      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'failed',
        expect.stringContaining('"detail": "info"'),
        expect.stringContaining('Error: test error')
      );
    });
  });
});

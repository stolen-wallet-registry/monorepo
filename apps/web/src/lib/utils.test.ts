import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseError } from 'viem';
import { cn, sanitizeErrorMessage } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('merges tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});

describe('sanitizeErrorMessage', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('viem BaseError handling', () => {
    it('handles UserRejectedRequestError', () => {
      const error = new BaseError('User rejected request');
      Object.defineProperty(error, 'name', { value: 'UserRejectedRequestError' });

      expect(sanitizeErrorMessage(error)).toBe(
        'Transaction was cancelled. Please try again when ready.'
      );
    });

    it('handles InsufficientFundsError', () => {
      const error = new BaseError('Insufficient funds');
      Object.defineProperty(error, 'name', { value: 'InsufficientFundsError' });

      expect(sanitizeErrorMessage(error)).toBe('Insufficient funds to complete this transaction.');
    });

    it('handles NonceTooLowError', () => {
      const error = new BaseError('Nonce too low');
      Object.defineProperty(error, 'name', { value: 'NonceTooLowError' });

      expect(sanitizeErrorMessage(error)).toBe(
        'Transaction conflict detected. Please refresh and try again.'
      );
    });

    it('handles HttpRequestError', () => {
      const error = new BaseError('HTTP request failed');
      Object.defineProperty(error, 'name', { value: 'HttpRequestError' });

      expect(sanitizeErrorMessage(error)).toBe(
        'Network error. Please check your connection and try again.'
      );
    });

    it('handles TimeoutError', () => {
      const error = new BaseError('Request timed out');
      Object.defineProperty(error, 'name', { value: 'TimeoutError' });

      expect(sanitizeErrorMessage(error)).toBe(
        'Network error. Please check your connection and try again.'
      );
    });
  });

  describe('message-based fallback', () => {
    it('handles user rejected message variants', () => {
      expect(sanitizeErrorMessage(new Error('User rejected the request'))).toBe(
        'Transaction was cancelled. Please try again when ready.'
      );
      expect(sanitizeErrorMessage(new Error('user rejected transaction'))).toBe(
        'Transaction was cancelled. Please try again when ready.'
      );
    });

    it('handles insufficient funds message', () => {
      expect(sanitizeErrorMessage(new Error('insufficient funds for gas'))).toBe(
        'Insufficient funds to complete this transaction.'
      );
    });

    it('handles nonce too low message', () => {
      expect(sanitizeErrorMessage(new Error('nonce too low'))).toBe(
        'Transaction conflict detected. Please refresh and try again.'
      );
    });

    it('handles network error messages', () => {
      expect(sanitizeErrorMessage(new Error('network connection failed'))).toBe(
        'Network error. Please check your connection and try again.'
      );
      expect(sanitizeErrorMessage(new Error('Network request failed'))).toBe(
        'Network error. Please check your connection and try again.'
      );
    });
  });

  describe('message sanitization', () => {
    it('strips viem version info', () => {
      const result = sanitizeErrorMessage(new Error('Something failed Version: viem@2.41.2'));
      expect(result).toBe('Something failed');
      expect(result).not.toContain('viem');
    });

    it('strips Details prefix', () => {
      const result = sanitizeErrorMessage(
        new Error('Contract call failed. Details: some internal error.')
      );
      expect(result).toBe('Contract call failed.');
    });

    it('cleans up whitespace', () => {
      const result = sanitizeErrorMessage(new Error('Error   with   extra   spaces'));
      expect(result).toBe('Error with extra spaces');
    });

    it('returns generic message for empty/short results', () => {
      expect(sanitizeErrorMessage(new Error(''))).toBe(
        'An unexpected error occurred. Please try again.'
      );
      expect(sanitizeErrorMessage(new Error('Err'))).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });

  describe('non-Error input handling', () => {
    it('handles string input', () => {
      expect(sanitizeErrorMessage('User rejected the request')).toBe(
        'Transaction was cancelled. Please try again when ready.'
      );
    });

    it('handles unknown input types', () => {
      // Objects stringify to [object Object] which passes length check
      expect(sanitizeErrorMessage({ message: 'some object' })).toBe('[object Object]');
      // Null/undefined become short strings, triggering generic message
      expect(sanitizeErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('development logging', () => {
    it('logs full error in development', () => {
      const error = new Error('Test error');
      sanitizeErrorMessage(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[Error Details]', error);
    });
  });
});

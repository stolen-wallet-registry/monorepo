import { describe, it, expect, vi } from 'vitest';
import { decodeContractError, getContractErrorInfo, sanitizeErrorMessage } from './decode';

describe('decodeContractError', () => {
  it('decodes known error selector to user-friendly message', () => {
    const result = decodeContractError('Execution reverted: custom error 0xec5c97a6');
    expect(result).toContain('registration window has expired');
  });

  it('returns null for unknown selector', () => {
    expect(decodeContractError('custom error 0x12345678')).toBeNull();
  });

  it('handles case insensitive selector', () => {
    const lower = decodeContractError('custom error 0xec5c97a6');
    const upper = decodeContractError('custom error 0xEC5C97A6');
    expect(lower).toBe(upper);
  });
});

describe('getContractErrorInfo', () => {
  it('returns error info for known selector', () => {
    const info = getContractErrorInfo('0xec5c97a6');
    expect(info?.name).toBe('Registration__ForwarderExpired');
  });

  it('returns undefined for unknown selector', () => {
    expect(getContractErrorInfo('0x12345678')).toBeUndefined();
  });
});

describe('sanitizeErrorMessage', () => {
  it('decodes contract custom errors', () => {
    const result = sanitizeErrorMessage(new Error('custom error 0xec5c97a6'));
    expect(result).toContain('registration window has expired');
  });

  it('handles user rejection', () => {
    expect(sanitizeErrorMessage(new Error('User rejected the request'))).toContain('cancelled');
  });

  it('strips version info and technical details', () => {
    const result = sanitizeErrorMessage(new Error('Error Version: viem@2.41.2'));
    expect(result).not.toContain('Version:');
    expect(result).not.toContain('viem');
  });

  it('returns generic message for empty/short errors', () => {
    expect(sanitizeErrorMessage(new Error(''))).toContain('unexpected error');
    expect(sanitizeErrorMessage(null)).toContain('unexpected error');
  });

  it('calls logError callback when provided', () => {
    const logError = vi.fn();
    sanitizeErrorMessage(new Error('test'), logError);
    expect(logError).toHaveBeenCalled();
  });

  it('handles non-Error objects', () => {
    expect(sanitizeErrorMessage({ message: 'some error' })).toBeDefined();
    expect(sanitizeErrorMessage('plain string error')).toBeDefined();
  });

  it('handles errors with Raw Call Arguments section', () => {
    const result = sanitizeErrorMessage(new Error('Error occurred Raw Call Arguments: 0x1234...'));
    expect(result).not.toContain('Raw Call Arguments');
  });

  it('handles multiple error patterns in one message', () => {
    const result = sanitizeErrorMessage(
      new Error('custom error 0xec5c97a6 Version: viem@2.41.2 Details: something')
    );
    expect(result).toContain('registration window has expired');
    expect(result).not.toContain('Version:');
  });
});

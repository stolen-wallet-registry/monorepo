import { describe, it, expect } from 'vitest';
import { formatCentsToUsd, formatEthConsistent } from './currency';

describe('formatCentsToUsd', () => {
  it('formats cents to dollars with two decimal places', () => {
    expect(formatCentsToUsd(199)).toBe('$1.99');
    expect(formatCentsToUsd(1)).toBe('$0.01');
    expect(formatCentsToUsd(0)).toBe('$0.00');
  });

  it('adds thousands separator for large amounts', () => {
    expect(formatCentsToUsd(100000)).toBe('$1,000.00');
  });
});

describe('formatEthConsistent', () => {
  it('pads to specified decimal places', () => {
    expect(formatEthConsistent(1000000000000000000n, 4)).toBe('1.0000');
    expect(formatEthConsistent(100000000000000000n, 4)).toBe('0.1000');
  });

  it('truncates excess decimals (no rounding)', () => {
    expect(formatEthConsistent(123456789012345678n, 4)).toBe('0.1234');
  });

  it('handles zero wei', () => {
    expect(formatEthConsistent(0n, 4)).toBe('0.0000');
  });

  it('throws on invalid decimals', () => {
    expect(() => formatEthConsistent(1n, -1)).toThrow(RangeError);
    expect(() => formatEthConsistent(1n, 2.5)).toThrow(RangeError);
  });
});

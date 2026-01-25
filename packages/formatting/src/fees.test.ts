import { describe, it, expect } from 'vitest';
import { formatFeeLineItem } from './fees';

describe('formatFeeLineItem', () => {
  it('calculates USD from wei and ETH price', () => {
    const result = formatFeeLineItem(1000000000000000n, 3500); // 0.001 ETH at $3500
    expect(result.eth).toBe('0.00100000');
    expect(result.usd).toBe('$3.50');
  });

  it('returns dash for undefined/zero/negative ETH price', () => {
    expect(formatFeeLineItem(1000000000000000n, undefined).usd).toBe('—');
    expect(formatFeeLineItem(1000000000000000n, 0).usd).toBe('—');
    expect(formatFeeLineItem(1000000000000000n, -100).usd).toBe('—');
  });

  it('handles zero wei', () => {
    const result = formatFeeLineItem(0n, 3500);
    expect(result.eth).toBe('0.00000000');
    expect(result.usd).toBe('$0.00');
  });
});

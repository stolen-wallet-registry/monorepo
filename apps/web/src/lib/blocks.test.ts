import { describe, it, expect } from 'vitest';
import {
  getBlockTime,
  estimateTimeFromBlocks,
  estimateBlocksFromTime,
  formatTimeRemaining,
  formatTimeString,
  blocksRemaining,
  BLOCK_TIMES,
  DEFAULT_BLOCK_TIME,
} from './blocks';

describe('block utilities', () => {
  describe('getBlockTime', () => {
    it('returns correct block time for Ethereum mainnet', () => {
      expect(getBlockTime(1)).toBe(12);
    });

    it('returns correct block time for localhost/Anvil', () => {
      expect(getBlockTime(31337)).toBe(13);
    });

    it('returns correct block time for Base', () => {
      expect(getBlockTime(8453)).toBe(2);
    });

    it('returns correct block time for Optimism', () => {
      expect(getBlockTime(10)).toBe(2);
    });

    it('returns correct block time for Arbitrum', () => {
      expect(getBlockTime(42161)).toBe(0.25);
    });

    it('returns default block time for unknown chains', () => {
      expect(getBlockTime(999999)).toBe(DEFAULT_BLOCK_TIME);
    });

    it('has all expected chains configured', () => {
      expect(BLOCK_TIMES[1]).toBeDefined(); // Ethereum
      expect(BLOCK_TIMES[8453]).toBeDefined(); // Base
      expect(BLOCK_TIMES[10]).toBeDefined(); // Optimism
      expect(BLOCK_TIMES[42161]).toBeDefined(); // Arbitrum
      expect(BLOCK_TIMES[137]).toBeDefined(); // Polygon
    });
  });

  describe('estimateTimeFromBlocks', () => {
    it('calculates time for Ethereum mainnet (12s blocks)', () => {
      // 10 blocks * 12 seconds * 1000 = 120000ms
      expect(estimateTimeFromBlocks(10n, 1)).toBe(120000);
    });

    it('calculates time for Base (2s blocks)', () => {
      // 10 blocks * 2 seconds * 1000 = 20000ms
      expect(estimateTimeFromBlocks(10n, 8453)).toBe(20000);
    });

    it('calculates time for Arbitrum (0.25s blocks)', () => {
      // 100 blocks * 0.25 seconds * 1000 = 25000ms
      expect(estimateTimeFromBlocks(100n, 42161)).toBe(25000);
    });

    it('calculates time for localhost (13s blocks)', () => {
      // 60 blocks * 13 seconds * 1000 = 780000ms
      expect(estimateTimeFromBlocks(60n, 31337)).toBe(780000);
    });

    it('returns 0 for zero blocks', () => {
      expect(estimateTimeFromBlocks(0n, 1)).toBe(0);
    });

    it('returns 0 for negative blocks', () => {
      expect(estimateTimeFromBlocks(-5n, 1)).toBe(0);
    });
  });

  describe('estimateBlocksFromTime', () => {
    it('estimates blocks for Ethereum mainnet', () => {
      // 120000ms / 1000 / 12 = 10 blocks
      expect(estimateBlocksFromTime(120000, 1)).toBe(10n);
    });

    it('estimates blocks for Base', () => {
      // 20000ms / 1000 / 2 = 10 blocks
      expect(estimateBlocksFromTime(20000, 8453)).toBe(10n);
    });

    it('estimates blocks for Arbitrum', () => {
      // 25000ms / 1000 / 0.25 = 100 blocks
      expect(estimateBlocksFromTime(25000, 42161)).toBe(100n);
    });

    it('rounds up partial blocks', () => {
      // 13000ms / 1000 / 12 = 1.083... → 2 blocks
      expect(estimateBlocksFromTime(13000, 1)).toBe(2n);
    });

    it('returns 0 for zero milliseconds', () => {
      expect(estimateBlocksFromTime(0, 1)).toBe(0n);
    });

    it('returns 0 for negative milliseconds', () => {
      expect(estimateBlocksFromTime(-1000, 1)).toBe(0n);
    });
  });

  describe('formatTimeRemaining', () => {
    it('formats seconds correctly', () => {
      const result = formatTimeRemaining(45000); // 45 seconds
      expect(result).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 45,
        totalSeconds: 45,
      });
    });

    it('formats minutes and seconds correctly', () => {
      const result = formatTimeRemaining(150000); // 2:30
      expect(result).toEqual({
        days: 0,
        hours: 0,
        minutes: 2,
        seconds: 30,
        totalSeconds: 150,
      });
    });

    it('formats hours, minutes, and seconds correctly', () => {
      const result = formatTimeRemaining(3750000); // 1:02:30
      expect(result).toEqual({
        days: 0,
        hours: 1,
        minutes: 2,
        seconds: 30,
        totalSeconds: 3750,
      });
    });

    it('formats days correctly', () => {
      const result = formatTimeRemaining(90061000); // 1 day, 1:01:01
      expect(result).toEqual({
        days: 1,
        hours: 1,
        minutes: 1,
        seconds: 1,
        totalSeconds: 90061,
      });
    });

    it('returns zeros for zero milliseconds', () => {
      const result = formatTimeRemaining(0);
      expect(result).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
      });
    });

    it('returns zeros for negative milliseconds', () => {
      const result = formatTimeRemaining(-5000);
      expect(result).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
      });
    });
  });

  describe('formatTimeString', () => {
    it('formats as MM:SS by default', () => {
      expect(formatTimeString(150000)).toBe('02:30');
    });

    it('includes hours when time exceeds 1 hour', () => {
      expect(formatTimeString(3750000)).toBe('1:02:30');
    });

    it('shows hours when option is true', () => {
      expect(formatTimeString(150000, { showHours: true })).toBe('0:02:30');
    });

    it('pads minutes by default', () => {
      expect(formatTimeString(65000)).toBe('01:05');
    });

    it('does not pad minutes when option is false', () => {
      expect(formatTimeString(65000, { padMinutes: false })).toBe('1:05');
    });

    it('formats zero correctly', () => {
      expect(formatTimeString(0)).toBe('00:00');
    });

    it('formats negative as zero', () => {
      expect(formatTimeString(-5000)).toBe('00:00');
    });
  });

  describe('blocksRemaining', () => {
    it('calculates positive remaining blocks', () => {
      expect(blocksRemaining(100n, 150n)).toBe(50n);
    });

    it('returns 0 when current equals target', () => {
      expect(blocksRemaining(100n, 100n)).toBe(0n);
    });

    it('returns 0 when current exceeds target', () => {
      expect(blocksRemaining(150n, 100n)).toBe(0n);
    });

    it('handles large block numbers', () => {
      const current = 18_000_000n;
      const target = 18_000_100n;
      expect(blocksRemaining(current, target)).toBe(100n);
    });
  });
});

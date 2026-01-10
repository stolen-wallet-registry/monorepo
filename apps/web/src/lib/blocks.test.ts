import { describe, it, expect } from 'vitest';
import {
  getBlockTime,
  estimateTimeFromBlocks,
  estimateBlocksFromTime,
  formatTimeRemaining,
  formatTimeString,
  blocksRemaining,
  BLOCK_TIMES,
} from './blocks';

/**
 * Block utilities tests.
 *
 * NOTE: These tests only cover chains defined in @swr/chains:
 * - Base (8453), Optimism (10) - production L2s
 * - Base Sepolia (84532), Optimism Sepolia (11155420) - testnets
 * - Anvil Hub (31337), Anvil Spoke (31338) - local development
 *
 * Chains not in @swr/chains (Ethereum mainnet, Arbitrum, Polygon, etc.)
 * will fall back to DEFAULT_BLOCK_TIME (12 seconds).
 */
describe('block utilities', () => {
  describe('getBlockTime', () => {
    it('returns correct block time for Anvil Hub', () => {
      expect(getBlockTime(31337)).toBe(13);
    });

    it('returns correct block time for Anvil Spoke', () => {
      // Anvil spoke uses same block time as hub for consistency
      expect(getBlockTime(31338)).toBe(13);
    });

    it('returns correct block time for Base', () => {
      expect(getBlockTime(8453)).toBe(2);
    });

    it('returns correct block time for Optimism', () => {
      expect(getBlockTime(10)).toBe(2);
    });

    it('returns correct block time for Base Sepolia', () => {
      expect(getBlockTime(84532)).toBe(2);
    });

    it('returns correct block time for Optimism Sepolia', () => {
      expect(getBlockTime(11155420)).toBe(2);
    });

    it('returns default block time for unknown chains', () => {
      // Unknown chains fall back to 12 seconds (Ethereum mainnet default)
      expect(getBlockTime(999999)).toBe(12);
    });

    it('has all SWR-supported chains configured', () => {
      expect(BLOCK_TIMES[31337]).toBeDefined(); // Anvil Hub
      expect(BLOCK_TIMES[31338]).toBeDefined(); // Anvil Spoke
      expect(BLOCK_TIMES[8453]).toBeDefined(); // Base
      expect(BLOCK_TIMES[10]).toBeDefined(); // Optimism
      expect(BLOCK_TIMES[84532]).toBeDefined(); // Base Sepolia
      expect(BLOCK_TIMES[11155420]).toBeDefined(); // Optimism Sepolia
    });
  });

  describe('estimateTimeFromBlocks', () => {
    it('calculates time for Base (2s blocks)', () => {
      // 10 blocks * 2 seconds * 1000 = 20000ms
      expect(estimateTimeFromBlocks(10n, 8453)).toBe(20000);
    });

    it('calculates time for Optimism (2s blocks)', () => {
      // 10 blocks * 2 seconds * 1000 = 20000ms
      expect(estimateTimeFromBlocks(10n, 10)).toBe(20000);
    });

    it('calculates time for Anvil Hub (13s blocks)', () => {
      // 60 blocks * 13 seconds * 1000 = 780000ms
      expect(estimateTimeFromBlocks(60n, 31337)).toBe(780000);
    });

    it('calculates time for Anvil Spoke (13s blocks)', () => {
      // 10 blocks * 13 seconds * 1000 = 130000ms
      expect(estimateTimeFromBlocks(10n, 31338)).toBe(130000);
    });

    it('calculates time for unknown chain using default (12s)', () => {
      // 10 blocks * 12 seconds * 1000 = 120000ms
      expect(estimateTimeFromBlocks(10n, 999999)).toBe(120000);
    });

    it('returns 0 for zero blocks', () => {
      expect(estimateTimeFromBlocks(0n, 8453)).toBe(0);
    });

    it('returns 0 for negative blocks', () => {
      expect(estimateTimeFromBlocks(-5n, 8453)).toBe(0);
    });
  });

  describe('estimateBlocksFromTime', () => {
    it('estimates blocks for Base', () => {
      // 20000ms / 1000 / 2 = 10 blocks
      expect(estimateBlocksFromTime(20000, 8453)).toBe(10n);
    });

    it('estimates blocks for Optimism', () => {
      // 20000ms / 1000 / 2 = 10 blocks
      expect(estimateBlocksFromTime(20000, 10)).toBe(10n);
    });

    it('estimates blocks for Anvil Hub', () => {
      // 130000ms / 1000 / 13 = 10 blocks
      expect(estimateBlocksFromTime(130000, 31337)).toBe(10n);
    });

    it('estimates blocks for unknown chain using default', () => {
      // 120000ms / 1000 / 12 = 10 blocks
      expect(estimateBlocksFromTime(120000, 999999)).toBe(10n);
    });

    it('rounds up partial blocks', () => {
      // 3000ms / 1000 / 2 = 1.5 → 2 blocks
      expect(estimateBlocksFromTime(3000, 8453)).toBe(2n);
    });

    it('returns 0 for zero milliseconds', () => {
      expect(estimateBlocksFromTime(0, 8453)).toBe(0n);
    });

    it('returns 0 for negative milliseconds', () => {
      expect(estimateBlocksFromTime(-1000, 8453)).toBe(0n);
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

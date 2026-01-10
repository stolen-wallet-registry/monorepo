/**
 * Block time utilities for chain-aware time estimation.
 *
 * Different chains have different block times:
 * - Ethereum mainnet: ~12 seconds
 * - Base/Optimism: ~2 seconds
 * - Arbitrum: ~0.25 seconds (250ms)
 * - Localhost/Anvil: configurable (default 13s)
 */

import { getNetworkOrUndefined } from '../networks';

/** Default block time for unknown chains (seconds) */
const DEFAULT_BLOCK_TIME = 12;

/**
 * Gets the average block time for a chain in seconds.
 * @param chainId - The chain ID
 * @returns Block time in seconds
 */
export function getBlockTime(chainId: number): number {
  const network = getNetworkOrUndefined(chainId);
  return network?.blockTiming.blockTimeSeconds ?? DEFAULT_BLOCK_TIME;
}

/**
 * Gets the grace period blocks for a chain.
 * @param chainId - The chain ID
 * @returns Grace period in blocks
 */
export function getGraceBlocks(chainId: number): number {
  const network = getNetworkOrUndefined(chainId);
  return network?.blockTiming.graceBlocks ?? 60;
}

/**
 * Gets the deadline blocks for a chain.
 * @param chainId - The chain ID
 * @returns Deadline in blocks
 */
export function getDeadlineBlocks(chainId: number): number {
  const network = getNetworkOrUndefined(chainId);
  return network?.blockTiming.deadlineBlocks ?? 300;
}

/**
 * Estimates time in milliseconds from a block count.
 * @param blocks - Number of blocks
 * @param chainId - The chain ID
 * @returns Estimated time in milliseconds
 */
export function estimateTimeFromBlocks(blocks: bigint | number, chainId: number): number {
  const blockCount = typeof blocks === 'bigint' ? Number(blocks) : blocks;
  if (blockCount <= 0) return 0;
  const blockTime = getBlockTime(chainId);
  return blockCount * blockTime * 1000;
}

/**
 * Estimates block count from time in milliseconds.
 * @param ms - Time in milliseconds
 * @param chainId - The chain ID
 * @returns Estimated block count
 */
export function estimateBlocksFromTime(ms: number, chainId: number): bigint {
  if (ms <= 0) return 0n;
  const blockTime = getBlockTime(chainId);
  return BigInt(Math.ceil(ms / 1000 / blockTime));
}

/**
 * Time remaining breakdown.
 */
export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

/**
 * Formats milliseconds into days, hours, minutes, seconds breakdown.
 * @param ms - Time in milliseconds
 * @returns Time breakdown object
 */
export function formatTimeRemaining(ms: number): TimeRemaining {
  if (ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds };
}

export interface FormatTimeStringOptions {
  /** Show hours even if zero */
  showHours?: boolean;
  /** Show days even if zero */
  showDays?: boolean;
  /** Pad hours with leading zero */
  padHours?: boolean;
  /** Pad minutes with leading zero (default: true) */
  padMinutes?: boolean;
}

/**
 * Formats time remaining as a human-readable string.
 * @param ms - Time in milliseconds
 * @param options - Formatting options
 * @returns Formatted string like "2:30", "1:02:30", or "2d 05:30:00"
 */
export function formatTimeString(ms: number, options: FormatTimeStringOptions = {}): string {
  const { showHours = false, showDays = false, padHours = false, padMinutes = true } = options;
  const { days, hours, minutes, seconds } = formatTimeRemaining(ms);

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Show days if present or explicitly requested
  if (showDays || days > 0) {
    const hoursStr = padHours ? pad(hours) : hours.toString();
    return `${days}d ${hoursStr}:${pad(minutes)}:${pad(seconds)}`;
  }

  // Show hours if present or explicitly requested
  if (showHours || hours > 0) {
    const hoursStr = padHours ? pad(hours) : hours.toString();
    return `${hoursStr}:${pad(minutes)}:${pad(seconds)}`;
  }

  if (padMinutes) {
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  return `${minutes}:${pad(seconds)}`;
}

/**
 * Calculates remaining blocks until target.
 * @param currentBlock - Current block number
 * @param targetBlock - Target block number
 * @returns Blocks remaining (0 if already passed)
 */
export function blocksRemaining(currentBlock: bigint, targetBlock: bigint): bigint {
  if (targetBlock <= currentBlock) return 0n;
  return targetBlock - currentBlock;
}

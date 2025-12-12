/**
 * Block time utilities for chain-aware time estimation.
 *
 * Different chains have different block times:
 * - Ethereum mainnet: ~12 seconds
 * - Sepolia testnet: ~12 seconds
 * - Base/Optimism: ~2 seconds
 * - Arbitrum: ~0.25 seconds (250ms)
 * - Localhost/Anvil: ~13 seconds (configurable, match your anvil --block-time setting)
 */

/**
 * Average block times in seconds for supported chains.
 */
export const BLOCK_TIMES: Record<number, number> = {
  1: 12, // Ethereum mainnet
  11155111: 12, // Sepolia
  31337: 13, // Localhost/Anvil - match your anvil --block-time setting
  8453: 2, // Base
  84532: 2, // Base Sepolia
  10: 2, // Optimism
  11155420: 2, // Optimism Sepolia
  42161: 0.25, // Arbitrum One
  421614: 0.25, // Arbitrum Sepolia
  137: 2, // Polygon
  80002: 2, // Polygon Amoy
};

/**
 * Default block time for unknown chains (seconds).
 */
export const DEFAULT_BLOCK_TIME = 12;

/**
 * Gets the average block time for a chain in seconds.
 * @param chainId - The chain ID
 * @returns Block time in seconds
 */
export function getBlockTime(chainId: number): number {
  return BLOCK_TIMES[chainId] ?? DEFAULT_BLOCK_TIME;
}

/**
 * Estimates time in milliseconds from a block count.
 * @param blocks - Number of blocks
 * @param chainId - The chain ID
 * @returns Estimated time in milliseconds
 */
export function estimateTimeFromBlocks(blocks: bigint, chainId: number): number {
  if (blocks <= 0n) return 0;
  const blockTime = getBlockTime(chainId);
  return Number(blocks) * blockTime * 1000;
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

/**
 * Block time utilities - re-exported from @swr/chains.
 */

export {
  getBlockTime,
  getGraceBlocks,
  getDeadlineBlocks,
  estimateTimeFromBlocks,
  estimateBlocksFromTime,
  formatTimeRemaining,
  formatTimeString,
  blocksRemaining,
  type TimeRemaining,
  type FormatTimeStringOptions,
} from '@swr/chains';

// Derived constant for tests and components that need all block times
import { networks } from '@swr/chains';

export const BLOCK_TIMES: Record<number, number> = Object.fromEntries(
  Object.values(networks).map((n) => [n.chainId, n.blockTiming.blockTimeSeconds])
);

export const DEFAULT_BLOCK_TIME = 12;

/**
 * Ethereum type re-exports from viem.
 *
 * Use these types instead of inline `0x${string}` throughout the codebase.
 * This provides:
 * - Single source of truth for Ethereum types
 * - Better semantic meaning (Address vs Hash vs Hex)
 * - Type compatibility with viem/wagmi
 *
 * @example
 * import type { Address, Hash, Hex } from '@/lib/types/ethereum';
 *
 * function transfer(to: Address, amount: bigint): Hash { ... }
 */

// Re-export viem's built-in types
export type { Address, Hash, Hex } from 'viem';

// Also export the type guard utilities from viem for runtime checks
export { isAddress, isHash, isHex } from 'viem';

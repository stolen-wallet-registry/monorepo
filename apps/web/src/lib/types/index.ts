/**
 * Type exports.
 */

export type { Address, Hash, Hex } from './ethereum';
export { isAddress, isHash, isHex } from './ethereum';

export type { FeeLineItem, FeeBreakdown, RawFeeBreakdown } from './fees';

/**
 * Registry type for context-specific labels and behavior.
 * - 'wallet': Stolen Wallet Registry - registeree is the wallet being registered as stolen
 * - 'transaction': Stolen Transaction Registry - reporter is the wallet reporting stolen transactions
 */
export type RegistryType = 'wallet' | 'transaction';

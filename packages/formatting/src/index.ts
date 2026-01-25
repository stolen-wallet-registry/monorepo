/**
 * @swr/formatting - Currency, fee, and time formatting utilities.
 *
 * Provides consistent formatting for ETH amounts, USD values, and fees.
 * Used by web app, CLI, and relay for consistent display across tools.
 *
 * @example
 * ```typescript
 * import { formatCentsToUsd, formatEthConsistent, formatFeeLineItem } from '@swr/formatting';
 *
 * // Format cents to USD
 * formatCentsToUsd(500); // "$5.00"
 *
 * // Format wei to ETH with consistent decimals
 * formatEthConsistent(1000000000000000n); // "0.00100000"
 *
 * // Format fee line item with USD conversion
 * const fee = formatFeeLineItem(1000000000000000n, 3500);
 * // { wei: 1000000000000000n, eth: "0.00100000", usd: "$3.50" }
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type { FeeLineItem, FeeBreakdown, RawFeeBreakdown } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

export { formatCentsToUsd, formatEthConsistent } from './currency';

// ═══════════════════════════════════════════════════════════════════════════
// FEE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

export { formatFeeLineItem } from './fees';

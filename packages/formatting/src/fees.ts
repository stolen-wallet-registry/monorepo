/**
 * Fee formatting utilities.
 */

import { formatEthConsistent } from './currency';
import type { FeeLineItem } from './types';

/**
 * Format a fee amount into a FeeLineItem with wei, eth, and usd.
 *
 * Consolidates the fee formatting logic used across useQuoteFeeBreakdown
 * and useTxQuoteFeeBreakdown hooks.
 *
 * @param wei - Amount in wei (bigint)
 * @param ethPriceUsd - Current ETH price in USD (undefined if not available)
 * @returns FeeLineItem with wei, eth string, and usd string
 */
export function formatFeeLineItem(wei: bigint, ethPriceUsd: number | undefined): FeeLineItem {
  const eth = formatEthConsistent(wei);
  const ethAsNumber = Number(eth);

  let usd: string;
  if (ethPriceUsd && ethPriceUsd > 0) {
    const usdValue = ethAsNumber * ethPriceUsd;
    usd = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(usdValue);
  } else {
    usd = '—';
  }

  return { wei, eth, usd };
}

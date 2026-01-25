/**
 * Currency formatting utilities.
 */

import { formatEther } from 'viem';

/**
 * Format cents to USD string (e.g., 500 → "$5.00")
 */
export function formatCentsToUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Format wei to ETH string with consistent decimal places.
 *
 * Always shows exactly `decimals` places for proper alignment in fee displays.
 *
 * @param wei - Amount in wei (bigint)
 * @param decimals - Number of decimal places to show (default: 8, must be non-negative integer)
 * @returns Formatted ETH string (e.g., "0.00142857")
 * @throws RangeError if decimals is negative or not an integer
 */
export function formatEthConsistent(wei: bigint, decimals: number = 8): string {
  // Validate decimals parameter
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`decimals must be a non-negative integer, got: ${decimals}`);
  }

  const ethStr = formatEther(wei);
  const [whole, decimal = ''] = ethStr.split('.');

  if (decimals === 0) {
    return whole;
  }

  // Always pad/truncate to exact decimal places for alignment
  const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);

  return `${whole}.${paddedDecimal}`;
}

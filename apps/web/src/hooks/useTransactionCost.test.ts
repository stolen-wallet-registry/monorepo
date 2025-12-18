import { describe, it, expect } from 'vitest';
import { formatEther } from 'viem';
import { formatCentsToUsd } from '@/lib/utils';

/**
 * Light tests for useTransactionCost hook calculation logic.
 */
describe('useTransactionCost logic', () => {
  describe('total cost calculation', () => {
    it('adds protocol fee and gas for registration', () => {
      const feeWei = 1428571428571428n; // ~$5 at $3500/ETH
      const gasCostWei = 150000000000000n; // ~$0.50 at $3500/ETH
      const totalWei = feeWei + gasCostWei;

      expect(totalWei).toBe(1578571428571428n);
    });

    it('converts total to USD correctly', () => {
      const totalWei = 1578571428571428n;
      const ethPriceUsdCents = 350000; // $3,500/ETH
      const totalEthNum = Number(formatEther(totalWei));
      const totalUsdCents = Math.round(totalEthNum * ethPriceUsdCents);

      expect(formatCentsToUsd(totalUsdCents)).toBe('$5.52');
    });
  });

  describe('protocol fee USD recalculation', () => {
    it('recalculates protocol fee USD with current ETH price', () => {
      const feeWei = 1428571428571428n;
      const ethPriceUsdCents = 350000; // $3,500/ETH

      const feeEthNum = Number(formatEther(feeWei));
      const protocolFeeUsdCents = Math.round(feeEthNum * ethPriceUsdCents);

      // Should be approximately $5 (slight variance due to ETH price)
      expect(protocolFeeUsdCents).toBeGreaterThan(490);
      expect(protocolFeeUsdCents).toBeLessThan(510);
    });

    it('handles varying ETH prices', () => {
      const feeWei = 2500000000000000n; // 0.0025 ETH

      // At $2,000/ETH
      const lowPrice = 200000;
      const lowUsd = Math.round(Number(formatEther(feeWei)) * lowPrice);
      expect(formatCentsToUsd(lowUsd)).toBe('$5.00');

      // At $4,000/ETH
      const highPrice = 400000;
      const highUsd = Math.round(Number(formatEther(feeWei)) * highPrice);
      expect(formatCentsToUsd(highUsd)).toBe('$10.00');
    });
  });

  describe('edge cases', () => {
    it('handles zero gas cost', () => {
      const feeWei = 1428571428571428n;
      const gasCostWei = 0n;
      const totalWei = feeWei + gasCostWei;

      expect(totalWei).toBe(feeWei);
    });

    it('handles very large gas costs', () => {
      const feeWei = 1428571428571428n;
      const gasCostWei = 10000000000000000n; // 0.01 ETH (~$35 at $3500)
      const totalWei = feeWei + gasCostWei;

      expect(totalWei).toBe(11428571428571428n);

      const ethPriceUsdCents = 350000;
      const totalUsdCents = Math.round(Number(formatEther(totalWei)) * ethPriceUsdCents);
      expect(formatCentsToUsd(totalUsdCents)).toBe('$40.00');
    });
  });
});

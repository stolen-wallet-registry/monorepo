/**
 * Hook that combines protocol fee and gas estimates for transaction cost display.
 *
 * Chain-aware: Works on both hub and spoke chains.
 * - Acknowledgement step: Shows gas cost only (no protocol fee)
 * - Registration step: Shows protocol fee + gas cost + total
 *   - Hub: protocol fee from FeeManager
 *   - Spoke: bridge fee + registration fee from quoteRegistration
 */

import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { useQuoteRegistration } from './useQuoteRegistration';
import { useGasEstimate, type UseGasEstimateParams } from './useGasEstimate';
import { useEthPrice } from './useEthPrice';
import { logger } from '@/lib/logger';
import { formatCentsToUsd } from '@/lib/utils';

export interface TransactionCost {
  /** Protocol fee (only on registration) */
  protocolFee: {
    wei: bigint;
    eth: string;
    usd: string;
  } | null;

  /** Network gas cost */
  gasCost: {
    wei: bigint;
    eth: string;
    usd: string;
    gwei: string; // Gas price in gwei
  };

  /** Total cost (fee + gas) */
  total: {
    wei: bigint;
    eth: string;
    usd: string;
  };

  /** Current ETH price in USD (formatted, e.g., "$3,500.00") */
  ethPriceUsd: string;
}

export interface UseTransactionCostParams {
  /** Which step we're on - determines if protocol fee is shown */
  step: 'acknowledgement' | 'registration';
  /** Transaction args for gas estimation */
  args?: UseGasEstimateParams['args'];
}

export interface UseTransactionCostResult {
  /** The combined cost data, or null if loading/error */
  data: TransactionCost | null;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** The error object if there was an error */
  error: Error | null;
  /** Function to manually refetch all data */
  refetch: () => void;
}

/**
 * Hook to get combined transaction costs for display.
 *
 * For acknowledgement: Shows only gas estimate (no protocol fee)
 * For registration: Shows $5 protocol fee + gas estimate + total
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTransactionCost({
 *   step: 'registration',
 *   args: [deadline, nonce, owner, v, r, s],
 * });
 *
 * if (data) {
 *   console.log(`Protocol Fee: ${data.protocolFee?.usd}`);
 *   console.log(`Gas Cost: ${data.gasCost.usd}`);
 *   console.log(`Total: ${data.total.usd}`);
 * }
 * ```
 */
export function useTransactionCost({
  step,
  args,
}: UseTransactionCostParams): UseTransactionCostResult {
  const { address } = useAccount();

  // Get ETH price for USD conversions
  const ethPrice = useEthPrice();

  // Get fee from quoteRegistration (works on both hub and spoke)
  // On hub: returns registration fee
  // On spoke: returns bridge fee + registration fee
  const quoteResult = useQuoteRegistration(address);

  // Determine the value to send with the transaction
  // Registration sends the protocol fee, acknowledgement sends nothing
  const value = step === 'registration' ? quoteResult.feeWei : undefined;

  const gasEstimate = useGasEstimate({
    step,
    args,
    value,
    enabled: !!args,
  });

  const refetch = () => {
    quoteResult.refetch();
    gasEstimate.refetch();
    ethPrice.refetch();
  };

  // Build combined cost data
  let costData: TransactionCost | null = null;

  if (gasEstimate.data && ethPrice.data) {
    const gas = gasEstimate.data;

    // Use BigInt arithmetic for precision: (wei * ethPriceUsdCents) / 1e18
    const ethPriceUsdCentsBigInt = BigInt(ethPrice.data.usdCents);
    const WEI_PER_ETH = BigInt(1e18);

    // Protocol fee only applies to registration step
    const feeWei = quoteResult.feeWei ?? 0n;
    const protocolFeeUsdCents =
      step === 'registration' ? Number((feeWei * ethPriceUsdCentsBigInt) / WEI_PER_ETH) : 0;

    const protocolFee =
      step === 'registration' && quoteResult.feeWei
        ? {
            wei: quoteResult.feeWei,
            eth: quoteResult.feeEth!,
            usd: formatCentsToUsd(protocolFeeUsdCents),
          }
        : null;

    // Calculate total using BigInt arithmetic for precision
    const totalWei = (protocolFee?.wei ?? 0n) + gas.gasCostWei;
    const totalUsdCents = Number((totalWei * ethPriceUsdCentsBigInt) / WEI_PER_ETH);

    costData = {
      protocolFee,
      gasCost: {
        wei: gas.gasCostWei,
        eth: gas.gasCostEth,
        usd: gas.gasCostUsd,
        gwei: gas.gasPriceGwei,
      },
      total: {
        wei: totalWei,
        eth: formatEther(totalWei),
        usd: formatCentsToUsd(totalUsdCents),
      },
      ethPriceUsd: ethPrice.data.usdFormatted,
    };

    logger.contract.debug('Transaction cost calculated', {
      step,
      protocolFee: protocolFee?.usd ?? 'N/A',
      gasCost: costData.gasCost.usd,
      total: costData.total.usd,
    });
  }

  return {
    data: costData,
    isLoading: quoteResult.isLoading || gasEstimate.isLoading || ethPrice.isLoading,
    isError: quoteResult.isError || gasEstimate.isError || ethPrice.isError,
    error: quoteResult.error || gasEstimate.error || ethPrice.error,
    refetch,
  };
}

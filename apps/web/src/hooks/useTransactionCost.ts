/**
 * Hook that combines protocol fee and gas estimates for transaction cost display.
 *
 * - Acknowledgement step: Shows gas cost only (no protocol fee)
 * - Registration step: Shows $5 protocol fee + gas cost + total
 */

import { formatEther } from 'viem';
import { useFeeEstimate } from './useFeeEstimate';
import { useGasEstimate, type UseGasEstimateParams } from './useGasEstimate';
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
  const feeEstimate = useFeeEstimate();

  // Determine the value to send with the transaction
  // Registration sends the protocol fee, acknowledgement sends nothing
  const value = step === 'registration' ? feeEstimate.data?.feeWei : undefined;

  const gasEstimate = useGasEstimate({
    functionName: step === 'acknowledgement' ? 'acknowledge' : 'register',
    args,
    value,
    enabled: !!args,
  });

  const refetch = () => {
    feeEstimate.refetch();
    gasEstimate.refetch();
  };

  // Build combined cost data
  let costData: TransactionCost | null = null;

  if (gasEstimate.data && feeEstimate.data) {
    const fee = feeEstimate.data;
    const gas = gasEstimate.data;

    // Protocol fee only applies to registration
    // Recalculate USD using real ETH price for consistency with gas/total
    const protocolFeeUsdCents =
      step === 'registration'
        ? Math.round(Number(formatEther(fee.feeWei)) * fee.ethPriceUsdCents)
        : 0;

    const protocolFee =
      step === 'registration'
        ? {
            wei: fee.feeWei,
            eth: fee.feeEth,
            usd: formatCentsToUsd(protocolFeeUsdCents),
          }
        : null;

    // Calculate total
    const totalWei = (protocolFee?.wei ?? 0n) + gas.gasCostWei;
    const totalEthNum = Number(formatEther(totalWei));
    const totalUsdCents = Math.round(totalEthNum * fee.ethPriceUsdCents);

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
      ethPriceUsd: fee.ethPriceUsd,
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
    isLoading: feeEstimate.isLoading || gasEstimate.isLoading,
    isError: feeEstimate.isError || gasEstimate.isError,
    error: feeEstimate.error || gasEstimate.error,
    refetch,
  };
}

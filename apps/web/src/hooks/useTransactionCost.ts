/**
 * Hook that combines protocol fee and gas estimates for transaction cost display.
 *
 * Chain-aware: Works on both hub and spoke chains.
 * - Acknowledgement step: Shows gas cost only (no protocol fee)
 * - Registration step: Shows protocol fee + gas cost + total
 *   - Hub: protocol fee from FeeManager
 *   - Spoke: bridge fee + registration fee (with breakdown)
 */

import { useAccount, useChainId } from 'wagmi';
import { useQuoteFeeBreakdown } from './useQuoteFeeBreakdown';
import { useGasEstimate, type UseGasEstimateParams } from './useGasEstimate';
import { useEthPrice } from './useEthPrice';
import { logger } from '@/lib/logger';
import { formatCentsToUsd, formatEthConsistent } from '@/lib/utils';
import type { FeeLineItem } from '@/lib/types/fees';

export interface TransactionCost {
  /** Protocol/registration fee (only on registration) */
  protocolFee: FeeLineItem | null;

  /** Cross-chain bridge fee (spoke chains only, null on hub) */
  bridgeFee: FeeLineItem | null;

  /** Bridge name ("Hyperlane", "CCIP", etc.) - null on hub */
  bridgeName: string | null;

  /** Network gas cost */
  gasCost: FeeLineItem & {
    gwei: string; // Gas price in gwei
  };

  /** Total cost (all fees + gas) */
  total: FeeLineItem;

  /** Current ETH price in USD (formatted, e.g., "$3,500.00") */
  ethPriceUsd: string;

  /** True if this is a cross-chain transaction (spoke → hub) */
  isCrossChain: boolean;
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
  const chainId = useChainId();

  // Get ETH price for USD conversions
  const ethPrice = useEthPrice();

  logger.contract.debug('useTransactionCost: Fetching fee breakdown', {
    step,
    address,
    chainId,
    hasArgs: !!args,
  });

  // Get fee breakdown (works on both hub and spoke)
  // On hub: returns { bridgeFee: null, registrationFee, total, bridgeName: null, isCrossChain: false }
  // On spoke: returns { bridgeFee, registrationFee, total, bridgeName: "Hyperlane", isCrossChain: true }
  const breakdownResult = useQuoteFeeBreakdown(address);

  // Log fee breakdown result when it changes
  if (breakdownResult.data) {
    logger.contract.info('useTransactionCost: Fee breakdown received', {
      bridgeFee: breakdownResult.data.bridgeFee?.usd ?? 'N/A',
      bridgeFeeWei: breakdownResult.raw?.bridgeFee?.toString() ?? '0',
      registrationFee: breakdownResult.data.registrationFee?.usd ?? 'N/A',
      registrationFeeWei: breakdownResult.raw?.registrationFee?.toString() ?? '0',
      totalFee: breakdownResult.data.total?.usd ?? 'N/A',
      totalFeeWei: breakdownResult.raw?.total?.toString() ?? '0',
      bridgeName: breakdownResult.data.bridgeName ?? 'N/A',
      isCrossChain: breakdownResult.data.isCrossChain,
    });
  }

  // Determine the value to send with the transaction
  // Registration sends the total fee, acknowledgement sends nothing
  const value = step === 'registration' ? breakdownResult.raw?.total : undefined;

  const gasEstimate = useGasEstimate({
    step,
    args,
    value,
    enabled: !!args,
  });

  const refetch = () => {
    breakdownResult.refetch();
    gasEstimate.refetch();
    ethPrice.refetch();
  };

  // Build combined cost data
  let costData: TransactionCost | null = null;

  if (gasEstimate.data && ethPrice.data) {
    const gas = gasEstimate.data;
    const breakdown = breakdownResult.data;

    // Use BigInt arithmetic for precision: (wei * ethPriceUsdCents) / 1e18
    const ethPriceUsdCentsBigInt = BigInt(ethPrice.data.usdCents);
    const WEI_PER_ETH = BigInt(1e18);

    // Protocol fee (registration fee) only applies to registration step
    const protocolFee =
      step === 'registration' && breakdown?.registrationFee ? breakdown.registrationFee : null;

    // Bridge fee only applies to registration step on spoke chains
    const bridgeFee = step === 'registration' && breakdown?.bridgeFee ? breakdown.bridgeFee : null;

    // Calculate total: protocol fee + bridge fee + gas
    const protocolFeeWei = protocolFee?.wei ?? 0n;
    const bridgeFeeWei = bridgeFee?.wei ?? 0n;
    const totalWei = protocolFeeWei + bridgeFeeWei + gas.gasCostWei;
    const totalUsdCents = Number((totalWei * ethPriceUsdCentsBigInt) / WEI_PER_ETH);

    costData = {
      protocolFee,
      bridgeFee,
      bridgeName: breakdown?.bridgeName ?? null,
      gasCost: {
        wei: gas.gasCostWei,
        eth: gas.gasCostEth,
        usd: gas.gasCostUsd,
        gwei: gas.gasPriceGwei,
      },
      total: {
        wei: totalWei,
        eth: formatEthConsistent(totalWei),
        usd: formatCentsToUsd(totalUsdCents),
      },
      ethPriceUsd: ethPrice.data.usdFormatted,
      isCrossChain: breakdown?.isCrossChain ?? false,
    };

    logger.contract.info('useTransactionCost: Final cost calculated', {
      step,
      chainId,
      protocolFee: protocolFee?.usd ?? 'N/A',
      protocolFeeEth: protocolFee?.eth ?? 'N/A',
      bridgeFee: bridgeFee?.usd ?? 'N/A',
      bridgeFeeEth: bridgeFee?.eth ?? 'N/A',
      bridgeName: costData.bridgeName ?? 'N/A',
      gasCost: costData.gasCost.usd,
      gasCostEth: costData.gasCost.eth,
      total: costData.total.usd,
      totalEth: costData.total.eth,
      ethPriceUsd: costData.ethPriceUsd,
      isCrossChain: costData.isCrossChain,
    });
  }

  return {
    data: costData,
    isLoading: breakdownResult.isLoading || gasEstimate.isLoading || ethPrice.isLoading,
    isError: breakdownResult.isError || gasEstimate.isError || ethPrice.isError,
    error: breakdownResult.error || gasEstimate.error || ethPrice.error,
    refetch,
  };
}

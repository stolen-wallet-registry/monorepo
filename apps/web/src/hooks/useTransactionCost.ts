/**
 * Hook that combines protocol fee and gas estimates for transaction cost display.
 *
 * Chain-aware: Works on both hub and spoke chains.
 * - Acknowledgement step: Shows gas cost only (no protocol fee)
 * - Registration step: Shows protocol fee + gas cost + total
 *   - Hub: protocol fee from FeeManager
 *   - Spoke: bridge fee + registration fee (with breakdown)
 */

import { useEffect, useRef, useMemo } from 'react';
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

  // Get fee breakdown (works on both hub and spoke)
  // On hub: returns { bridgeFee: null, registrationFee, total, bridgeName: null, isCrossChain: false }
  // On spoke: returns { bridgeFee, registrationFee, total, bridgeName: "Hyperlane", isCrossChain: true }
  const breakdownResult = useQuoteFeeBreakdown(address);

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

  // Track previous values to avoid duplicate logs
  const prevCostRef = useRef<string | null>(null);

  // Build combined cost data - memoized to stabilize reference
  const costData = useMemo((): TransactionCost | null => {
    if (!gasEstimate.data || !ethPrice.data) return null;

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

    return {
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
  }, [gasEstimate.data, ethPrice.data, breakdownResult.data, step]);

  // Log cost changes in effect to avoid excessive render-time logging
  useEffect(() => {
    if (!costData) return;

    const costKey = `${costData.total.usd}-${step}-${chainId}`;
    if (costKey === prevCostRef.current) return;
    prevCostRef.current = costKey;

    logger.contract.info('useTransactionCost: Final cost calculated', {
      step,
      chainId,
      protocolFee: costData.protocolFee?.usd ?? 'N/A',
      protocolFeeEth: costData.protocolFee?.eth ?? 'N/A',
      bridgeFee: costData.bridgeFee?.usd ?? 'N/A',
      bridgeFeeEth: costData.bridgeFee?.eth ?? 'N/A',
      bridgeName: costData.bridgeName ?? 'N/A',
      gasCost: costData.gasCost.usd,
      gasCostEth: costData.gasCost.eth,
      total: costData.total.usd,
      totalEth: costData.total.eth,
      ethPriceUsd: costData.ethPriceUsd,
      isCrossChain: costData.isCrossChain,
    });
  }, [costData, step, chainId]);

  return {
    data: costData,
    isLoading: breakdownResult.isLoading || gasEstimate.isLoading || ethPrice.isLoading,
    isError: breakdownResult.isError || gasEstimate.isError || ethPrice.isError,
    error: breakdownResult.error || gasEstimate.error || ethPrice.error,
    refetch,
  };
}

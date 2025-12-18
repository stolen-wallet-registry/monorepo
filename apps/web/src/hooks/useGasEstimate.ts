/**
 * Hook to estimate gas costs for registration transactions.
 *
 * Uses wagmi's useEstimateGas and useFeeData to calculate:
 * - Gas units needed for the transaction
 * - Current gas price
 * - Total gas cost in ETH and USD
 */

import { useEstimateGas, useGasPrice, useChainId } from 'wagmi';
import { formatEther, formatGwei, encodeFunctionData } from 'viem';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getStolenWalletRegistryAddress } from '@/lib/contracts/addresses';
import { useFeeEstimate } from './useFeeEstimate';
import { logger } from '@/lib/logger';
import { formatCentsToUsd } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';

export interface GasEstimate {
  /** Estimated gas units for the transaction */
  gasUnits: bigint;
  /** Current gas price in wei */
  gasPriceWei: bigint;
  /** Current gas price in gwei (formatted string, e.g., "1.5") */
  gasPriceGwei: string;
  /** Total gas cost in wei (gasUnits * gasPriceWei) */
  gasCostWei: bigint;
  /** Total gas cost in ETH (formatted string, e.g., "0.00015") */
  gasCostEth: string;
  /** Total gas cost in USD (formatted string, e.g., "$0.52") */
  gasCostUsd: string;
}

export interface UseGasEstimateParams {
  /** Which function to estimate gas for */
  functionName: 'acknowledge' | 'register';
  /** Function arguments (must match the function signature) */
  args: readonly [bigint, bigint, Address, number, `0x${string}`, `0x${string}`] | undefined;
  /** Value to send with the transaction (for registration) */
  value?: bigint;
  /** Whether to enable the estimate (default: true) */
  enabled?: boolean;
}

export interface UseGasEstimateResult {
  /** The gas estimate data, or null if loading/error/disabled */
  data: GasEstimate | null;
  /** Whether the estimate is currently loading */
  isLoading: boolean;
  /** Whether there was an error estimating gas */
  isError: boolean;
  /** The error object if there was an error */
  error: Error | null;
  /** Function to manually refetch the estimate */
  refetch: () => void;
}

/** Polling interval for gas estimates (15 seconds - faster than fee polling) */
const GAS_POLL_INTERVAL = 15_000;

/** Gas buffer multiplier (add 20% for safety) */
const GAS_BUFFER = 1.2;

/**
 * Hook to estimate gas costs for registration transactions.
 *
 * Polls gas prices every 15 seconds and re-estimates when args change.
 * Uses ETH price from FeeManager to convert gas cost to USD.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useGasEstimate({
 *   functionName: 'register',
 *   args: [deadline, nonce, owner, v, r, s],
 *   value: feeWei,
 * });
 *
 * if (data) {
 *   console.log(`Gas cost: ${data.gasCostUsd} (${data.gasCostEth} ETH)`);
 * }
 * ```
 */
export function useGasEstimate({
  functionName,
  args,
  value,
  enabled = true,
}: UseGasEstimateParams): UseGasEstimateResult {
  const chainId = useChainId();
  const { data: feeData } = useFeeEstimate();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getStolenWalletRegistryAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  // Build call data for gas estimation
  const callData = args
    ? encodeFunctionData({
        abi: stolenWalletRegistryAbi,
        functionName,
        args,
      })
    : undefined;

  const estimateEnabled = enabled && !!contractAddress && !!args;

  // Estimate gas units
  const {
    data: gasEstimate,
    isLoading: isEstimating,
    isError: isEstimateError,
    error: estimateError,
    refetch: refetchEstimate,
  } = useEstimateGas({
    to: contractAddress,
    data: callData,
    value,
    query: {
      enabled: estimateEnabled,
      staleTime: GAS_POLL_INTERVAL / 2,
    },
  });

  // Get current gas price
  const {
    data: gasPrice,
    isLoading: isPriceLoading,
    isError: isPriceError,
    error: priceError,
    refetch: refetchPrice,
  } = useGasPrice({
    query: {
      enabled: estimateEnabled,
      refetchInterval: GAS_POLL_INTERVAL,
      staleTime: GAS_POLL_INTERVAL / 2,
    },
  });

  // Combine refetch functions
  const refetch = () => {
    refetchEstimate();
    refetchPrice();
  };

  // Transform data into GasEstimate
  let gasEstimateResult: GasEstimate | null = null;

  if (gasEstimate && gasPrice && feeData) {
    // Add safety buffer to gas estimate
    const gasUnits = BigInt(Math.ceil(Number(gasEstimate) * GAS_BUFFER));
    const gasCostWei = gasUnits * gasPrice;

    // Convert gas cost to USD using ETH price from FeeManager
    const gasCostEthNum = Number(formatEther(gasCostWei));
    const gasCostUsdCents = Math.round(gasCostEthNum * feeData.ethPriceUsdCents);

    gasEstimateResult = {
      gasUnits,
      gasPriceWei: gasPrice,
      gasPriceGwei: formatGwei(gasPrice),
      gasCostWei,
      gasCostEth: formatEther(gasCostWei),
      gasCostUsd: formatCentsToUsd(gasCostUsdCents),
    };

    logger.contract.debug('Gas estimate updated', {
      functionName,
      gasUnits: gasUnits.toString(),
      gasPriceGwei: gasEstimateResult.gasPriceGwei,
      gasCostUsd: gasEstimateResult.gasCostUsd,
    });
  }

  return {
    data: gasEstimateResult,
    isLoading: isEstimating || isPriceLoading,
    isError: isEstimateError || isPriceError,
    error: (estimateError || priceError) as Error | null,
    refetch,
  };
}

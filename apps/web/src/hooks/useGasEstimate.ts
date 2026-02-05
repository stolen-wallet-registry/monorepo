/**
 * Hook to estimate gas costs for registration transactions.
 *
 * Chain-aware: Uses correct ABI and function names for hub vs spoke.
 * Uses wagmi's useEstimateGas and useGasPrice to calculate:
 * - Gas units needed for the transaction
 * - Current gas price
 * - Total gas cost in ETH and USD
 */

import { useEstimateGas, useGasPrice, useChainId } from 'wagmi';
import { formatEther, formatGwei, encodeFunctionData } from 'viem';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import { useEthPrice } from './useEthPrice';
import { logger } from '@/lib/logger';
import { formatCentsToUsd, formatEthConsistent } from '@/lib/utils';
import type { WalletRegistrationArgs } from '@/lib/signatures';

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
  /** Which step we're estimating for - maps to correct function based on chain */
  step: 'acknowledgement' | 'registration';
  /**
   * V2 unified function arguments (both hub and spoke):
   * [wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s]
   */
  args: WalletRegistrationArgs | undefined;
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

/** Gas buffer multiplier numerator (add 20% for safety) */
const GAS_BUFFER_NUMERATOR = 120n;
/** Gas buffer multiplier denominator */
const GAS_BUFFER_DENOMINATOR = 100n;

/**
 * Hook to estimate gas costs for registration transactions.
 *
 * Polls gas prices every 15 seconds and re-estimates when args change.
 * Uses ETH price from FeeManager to convert gas cost to USD.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useGasEstimate({
 *   step: 'registration',
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
  step,
  args,
  value,
  enabled = true,
}: UseGasEstimateParams): UseGasEstimateResult {
  const chainId = useChainId();
  const ethPrice = useEthPrice();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useGasEstimate'
  );

  // Get the correct ABI and function names for hub/spoke
  const { abi, functions } = getRegistryMetadata('wallet', registryType);

  // Map step to correct function name using metadata
  const functionName = step === 'acknowledgement' ? functions.acknowledge : functions.register;

  // Build call data for gas estimation
  // Cast functionName and args since viem expects specific literal types from ABI
  const callData = args
    ? encodeFunctionData({
        abi,
        functionName: functionName as 'acknowledge' | 'register',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args as any,
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
    ethPrice.refetch();
  };

  // Transform data into GasEstimate
  let gasEstimateResult: GasEstimate | null = null;

  if (gasEstimate && gasPrice && ethPrice.data) {
    // Add safety buffer to gas estimate using bigint arithmetic to avoid precision loss
    const gasUnits = (gasEstimate * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;
    const gasCostWei = gasUnits * gasPrice;

    // Convert gas cost to USD using ETH price from CoinGecko
    const gasCostEthNum = Number(formatEther(gasCostWei));
    const gasCostUsdCents = Math.round(gasCostEthNum * ethPrice.data.usdCents);

    gasEstimateResult = {
      gasUnits,
      gasPriceWei: gasPrice,
      gasPriceGwei: formatGwei(gasPrice),
      gasCostWei,
      gasCostEth: formatEthConsistent(gasCostWei),
      gasCostUsd: formatCentsToUsd(gasCostUsdCents),
    };

    logger.contract.debug('Gas estimate updated', {
      step,
      functionName,
      registryType,
      gasUnits: gasUnits.toString(),
      gasPriceGwei: gasEstimateResult.gasPriceGwei,
      gasCostUsd: gasEstimateResult.gasCostUsd,
    });
  }

  return {
    data: gasEstimateResult,
    isLoading: isEstimating || isPriceLoading || ethPrice.isLoading,
    isError: isEstimateError || isPriceError || ethPrice.isError,
    error: (estimateError || priceError || ethPrice.error) as Error | null,
    refetch,
  };
}

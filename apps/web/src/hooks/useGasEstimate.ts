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
import { walletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { useEthPrice } from './useEthPrice';
import { logger } from '@/lib/logger';
import { formatCentsToUsd, formatEthConsistent } from '@/lib/utils';
import type { WalletAcknowledgeArgs, WalletRegistrationArgs } from '@/lib/signatures';

/** Union type for gas estimation args (either acknowledge or register) */
type WalletContractArgs = WalletAcknowledgeArgs | WalletRegistrationArgs;

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
   * Contract function arguments:
   * - acknowledge: [registeree, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s]
   * - register: [registeree, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s]
   */
  args: WalletContractArgs | undefined;
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

  const isSpoke = registryType === 'spoke';

  // Map step to correct function name (identical on both hub and spoke)
  const functionName = step === 'acknowledgement' ? 'acknowledge' : 'register';

  // Build call data for gas estimation — branch on ABI for type safety
  // encodeFunctionData requires args to match the ABI's tuple type exactly.
  // Since args is a union (WalletAcknowledgeArgs | WalletRegistrationArgs),
  // we encode via the concrete ABI branch to satisfy viem's inference.
  let callData: `0x${string}` | undefined;
  if (args) {
    if (isSpoke) {
      callData =
        functionName === 'acknowledge'
          ? encodeFunctionData({
              abi: spokeRegistryAbi,
              functionName: 'acknowledge',
              args: args as WalletAcknowledgeArgs,
            })
          : encodeFunctionData({
              abi: spokeRegistryAbi,
              functionName: 'register',
              args: args as WalletRegistrationArgs,
            });
    } else {
      callData =
        functionName === 'acknowledge'
          ? encodeFunctionData({
              abi: walletRegistryAbi,
              functionName: 'acknowledge',
              args: args as WalletAcknowledgeArgs,
            })
          : encodeFunctionData({
              abi: walletRegistryAbi,
              functionName: 'register',
              args: args as WalletRegistrationArgs,
            });
    }
  }

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

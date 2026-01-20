/**
 * Hook to estimate gas for cross-chain soulbound mint transactions.
 *
 * Estimates the gas cost for calling requestSupportMint or requestWalletMint
 * on the SpokeSoulboundForwarder contract.
 */

import { useEstimateGas, useGasPrice, useAccount } from 'wagmi';
import { encodeFunctionData, formatEther, formatGwei } from 'viem';
import { spokeSoulboundForwarderAbi } from '@/lib/contracts/abis';
import { getSpokeSoulboundForwarderAddress } from '@/lib/contracts/crosschain-addresses';
import { isSpokeChain } from '@swr/chains';
import { useEthPrice } from '@/hooks/useEthPrice';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface CrossChainMintGasEstimate {
  /** Estimated gas units for the transaction */
  gasUnits: bigint;
  /** Current gas price in wei */
  gasPriceWei: bigint;
  /** Current gas price in gwei (formatted string) */
  gasPriceGwei: string;
  /** Total gas cost in wei */
  gasCostWei: bigint;
  /** Total gas cost in ETH (formatted string) */
  gasCostEth: string;
  /** Total gas cost in USD (number) */
  gasCostUsd: number;
}

export interface UseCrossChainMintGasEstimateParams {
  /** Type of mint: 'support' or 'wallet' */
  mintType: 'support' | 'wallet';
  /** Donation amount in wei (for support mint) */
  donationWei?: bigint;
  /** Wallet address (for wallet mint) */
  wallet?: Address;
  /** Cross-chain fee in wei */
  feeWei?: bigint;
  /** Whether to enable the estimate */
  enabled?: boolean;
}

export interface UseCrossChainMintGasEstimateResult {
  /** The gas estimate data */
  data: CrossChainMintGasEstimate | null;
  /** Whether loading */
  isLoading: boolean;
  /** Whether error */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/** Gas buffer: add 20% for safety */
const GAS_BUFFER_NUMERATOR = 120n;
const GAS_BUFFER_DENOMINATOR = 100n;

/** Polling interval (15 seconds) */
const GAS_POLL_INTERVAL = 15_000;

/**
 * Hook to estimate gas for cross-chain soulbound minting.
 */
export function useCrossChainMintGasEstimate({
  mintType,
  donationWei = 0n,
  wallet,
  feeWei = 0n,
  enabled = true,
}: UseCrossChainMintGasEstimateParams): UseCrossChainMintGasEstimateResult {
  const { chain } = useAccount();
  const currentChainId = chain?.id;
  const isOnSpokeChain = currentChainId ? isSpokeChain(currentChainId) : false;
  const { data: ethPriceData } = useEthPrice();

  // Get forwarder address
  let forwarderAddress: Address | undefined;
  if (isOnSpokeChain && currentChainId) {
    try {
      const addr = getSpokeSoulboundForwarderAddress(currentChainId);
      if (addr) forwarderAddress = addr;
    } catch {
      // Not configured
    }
  }

  // Build call data based on mint type
  // Wallet mint requires a wallet address, support mint requires donation amount
  const canBuildCallData = mintType === 'support' || (mintType === 'wallet' && wallet);
  const callData = canBuildCallData
    ? mintType === 'support'
      ? encodeFunctionData({
          abi: spokeSoulboundForwarderAbi,
          functionName: 'requestSupportMint',
          args: [donationWei],
        })
      : encodeFunctionData({
          abi: spokeSoulboundForwarderAbi,
          functionName: 'requestWalletMint',
          args: [wallet!],
        })
    : undefined;

  const totalValue = mintType === 'support' ? donationWei + feeWei : feeWei;
  const estimateEnabled =
    enabled && isOnSpokeChain && !!forwarderAddress && feeWei > 0n && !!callData;

  // Estimate gas units
  const {
    data: gasEstimate,
    isLoading: isEstimating,
    isError: isEstimateError,
    error: estimateError,
    refetch: refetchEstimate,
  } = useEstimateGas({
    to: forwarderAddress,
    data: callData,
    value: totalValue,
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

  const refetch = () => {
    refetchEstimate();
    refetchPrice();
  };

  // Build result
  let result: CrossChainMintGasEstimate | null = null;

  if (gasEstimate && gasPrice) {
    const gasUnits = (gasEstimate * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;
    const gasCostWei = gasUnits * gasPrice;
    const gasCostEthNum = parseFloat(formatEther(gasCostWei));
    const ethPrice = ethPriceData?.usd ?? 0;

    result = {
      gasUnits,
      gasPriceWei: gasPrice,
      gasPriceGwei: formatGwei(gasPrice),
      gasCostWei,
      gasCostEth: formatEther(gasCostWei),
      gasCostUsd: gasCostEthNum * ethPrice,
    };

    logger.contract.debug('Cross-chain mint gas estimate', {
      mintType,
      gasUnits: gasUnits.toString(),
      gasCostEth: result.gasCostEth,
      gasCostUsd: result.gasCostUsd.toFixed(2),
    });
  }

  return {
    data: result,
    isLoading: isEstimating || isPriceLoading,
    isError: isEstimateError || isPriceError,
    error: (estimateError || priceError) as Error | null,
    refetch,
  };
}

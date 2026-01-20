/**
 * Hook to quote cross-chain minting fees from SpokeSoulboundForwarder.
 *
 * Returns the Hyperlane cross-chain fee required to forward a mint request
 * from a spoke chain to the hub chain.
 */

import { useEffect } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { spokeSoulboundForwarderAbi } from '@/lib/contracts/abis';
import { getSpokeSoulboundForwarderAddress } from '@/lib/contracts/crosschain-addresses';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { isSpokeChain } from '@swr/chains';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface CrossChainMintFee {
  /** Fee amount in wei (native bigint) */
  feeWei: bigint;
  /** Fee amount in ETH (formatted string, e.g., "0.00143") */
  feeEth: string;
}

export interface UseQuoteCrossChainMintFeeResult {
  /** The cross-chain fee data, or null if loading/error/not on spoke */
  data: CrossChainMintFee | null;
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching data */
  isError: boolean;
  /** The error object if there was an error */
  error: Error | null;
  /** Function to manually refetch the data */
  refetch: () => void;
  /** True if currently connected to a spoke chain */
  isOnSpokeChain: boolean;
  /** True if currently connected to the hub chain */
  isOnHubChain: boolean;
  /** Hub chain ID where soulbound contracts are deployed */
  hubChainId: number;
  /** Current chain ID */
  currentChainId: number | undefined;
}

/** Polling interval for fee quotes (30 seconds) */
const FEE_POLL_INTERVAL = 30_000;

/**
 * Hook to get the cross-chain minting fee quote.
 *
 * This fee is paid to the SpokeSoulboundForwarder on spoke chains to cover
 * the Hyperlane message dispatch cost.
 *
 * @example
 * ```tsx
 * const { data, isOnSpokeChain, isOnHubChain, hubChainId } = useQuoteCrossChainMintFee();
 *
 * if (isOnHubChain) {
 *   return <p>Direct minting available on hub chain</p>;
 * }
 *
 * if (isOnSpokeChain && data) {
 *   return <p>Cross-chain fee: {data.feeEth} ETH</p>;
 * }
 * ```
 */
export function useQuoteCrossChainMintFee(): UseQuoteCrossChainMintFeeResult {
  const hubChainId = getHubChainIdForEnvironment();
  const { chain } = useAccount();
  const currentChainId = chain?.id;
  const isOnHubChain = currentChainId === hubChainId;
  const isOnSpokeChain = currentChainId ? isSpokeChain(currentChainId) : false;

  // Get spoke forwarder address for current chain
  let forwarderAddress: Address | null = null;
  let forwarderError: unknown = null;
  if (isOnSpokeChain && currentChainId) {
    try {
      forwarderAddress = getSpokeSoulboundForwarderAddress(currentChainId);
    } catch (error) {
      forwarderError = error;
    }
  }

  // Debug logging - only when chain changes
  useEffect(() => {
    logger.contract.debug('useQuoteCrossChainMintFee state', {
      currentChainId,
      hubChainId,
      isOnHubChain,
      isOnSpokeChain,
      chainName: chain?.name,
    });

    if (forwarderAddress) {
      logger.contract.debug('SpokeSoulboundForwarder address resolved', {
        chainId: currentChainId,
        forwarderAddress,
      });
    } else if (forwarderError) {
      logger.contract.warn('SpokeSoulboundForwarder not configured for chain', {
        chainId: currentChainId,
        error: forwarderError,
      });
    }
  }, [
    currentChainId,
    hubChainId,
    isOnHubChain,
    isOnSpokeChain,
    chain?.name,
    forwarderAddress,
    forwarderError,
  ]);

  const enabled = isOnSpokeChain && !!forwarderAddress;

  const {
    data: feeWei,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContract({
    address: forwarderAddress ?? undefined,
    abi: spokeSoulboundForwarderAbi,
    functionName: 'quoteCrossChainFee',
    chainId: currentChainId,
    query: {
      enabled,
      refetchInterval: FEE_POLL_INTERVAL,
      staleTime: FEE_POLL_INTERVAL / 2,
    },
  });

  let feeData: CrossChainMintFee | null = null;
  if (feeWei !== undefined) {
    feeData = {
      feeWei,
      feeEth: formatEther(feeWei),
    };
  }

  // Log fee changes
  useEffect(() => {
    if (feeWei !== undefined) {
      logger.contract.debug('Cross-chain mint fee quoted', {
        feeWei: feeWei.toString(),
        feeEth: formatEther(feeWei),
        chainId: currentChainId,
      });
    }
  }, [feeWei, currentChainId]);

  return {
    data: feeData,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    isOnSpokeChain,
    isOnHubChain,
    hubChainId,
    currentChainId,
  };
}

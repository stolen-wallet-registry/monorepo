/**
 * Hook to get the registration fee for transaction batch registration.
 *
 * Calls quoteRegistration() on the transaction registry to get the required fee.
 * Supports both hub (StolenTransactionRegistry) and spoke (SpokeTransactionRegistry) chains.
 */

import { useMemo } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi, spokeTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress, isSpokeChain } from '@/lib/contracts/addresses';
import { formatEthConsistent } from '@/lib/utils';
import { useEthPrice } from '@/hooks/useEthPrice';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface TxQuoteFeeData {
  /** Fee amount in wei */
  feeWei: bigint;
  /** Fee amount in ETH (formatted string) */
  feeEth: string;
  /** Fee in USD (formatted string, e.g., "$5.00") */
  feeUsd: string;
}

export interface UseTxQuoteFeeResult {
  /** The quoted fee data, or null if loading/error */
  data: TxQuoteFeeData | null;
  /** Raw fee in wei (for passing to contract) */
  feeWei: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to get the registration fee for transaction batch registration.
 *
 * @param reporterAddress - The reporter address (used for nonce-based fee calculation)
 * @returns Fee data with wei, eth, and USD formatting
 */
export function useTxQuoteFee(reporterAddress: Address | null | undefined): UseTxQuoteFeeResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();
  const isSpoke = isSpokeChain(chainId);

  // Resolve contract address (spoke-aware)
  let contractAddress: Address | undefined;
  try {
    contractAddress = getTransactionRegistryAddress(chainId);
    logger.contract.debug('useTxQuoteFee: Registry address resolved', {
      chainId,
      contractAddress,
      isSpoke,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.warn('useTxQuoteFee: Failed to resolve registry address', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = reporterAddress ?? undefined;

  // Select correct ABI based on chain type
  const abi = isSpoke ? spokeTransactionRegistryAbi : stolenTransactionRegistryAbi;

  const {
    data: rawFee,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    functionName: 'quoteRegistration',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: !!normalizedAddress && !!contractAddress,
      staleTime: 30_000, // 30 seconds
      refetchInterval: 60_000, // 1 minute
    },
  });

  // Transform raw fee into formatted data
  const data = useMemo(() => {
    if (rawFee === undefined) return null;

    const feeWei = rawFee as bigint;
    const feeEth = formatEthConsistent(feeWei);
    const ethPriceUsd = ethPrice?.usd;

    let feeUsd: string;
    if (ethPriceUsd && ethPriceUsd > 0) {
      const ethNum = Number(feeEth);
      const usdValue = ethNum * ethPriceUsd;
      feeUsd = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(usdValue);
    } else {
      feeUsd = '—';
    }

    logger.contract.debug('useTxQuoteFee: Fee calculated', {
      feeWei: feeWei.toString(),
      feeEth,
      feeUsd,
    });

    return {
      feeWei,
      feeEth,
      feeUsd,
    };
  }, [rawFee, ethPrice?.usd]);

  return {
    data,
    feeWei: data?.feeWei,
    isLoading,
    isError,
    error,
    refetch,
  };
}

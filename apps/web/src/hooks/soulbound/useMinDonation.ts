/**
 * Hook to get the minimum donation amount for SupportSoulbound.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useChainId } from 'wagmi';
import { supportSoulboundAbi } from '@/lib/contracts/abis';
import { getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface UseMinDonationResult {
  /** Minimum donation amount in wei */
  minWei: bigint;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch */
  refetch: () => void;
}

export interface UseMinDonationOptions {
  /** Override chain ID to query (defaults to connected chain) */
  chainId?: number;
  /** Whether to enable the query */
  enabled?: boolean;
}

/**
 * Queries the minimum donation amount from the SupportSoulbound contract.
 *
 * @example
 * ```tsx
 * const { minWei, isLoading } = useMinDonation();
 *
 * if (isLoading) return <Spinner />;
 * return <p>Minimum donation: {formatEther(minWei)} ETH</p>;
 * ```
 */
export function useMinDonation({
  chainId: overrideChainId,
  enabled = true,
}: UseMinDonationOptions = {}): UseMinDonationResult {
  const connectedChainId = useChainId();
  const chainId = overrideChainId ?? connectedChainId;
  const client = usePublicClient({ chainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getSupportSoulboundAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  const queryEnabled =
    enabled &&
    !!contractAddress &&
    contractAddress !== '0x0000000000000000000000000000000000000000' &&
    !!client;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['soulbound', 'minWei', chainId],
    queryFn: async () => {
      if (!client || !contractAddress) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Fetching minWei', { chainId, contractAddress });

      const result = await client.readContract({
        address: contractAddress,
        abi: supportSoulboundAbi,
        functionName: 'minWei',
      });

      logger.contract.debug('minWei fetched', { minWei: result });

      return result as bigint;
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes - minWei doesn't change often
  });

  const refetch: () => void = () => {
    if (!queryEnabled) return;
    void queryRefetch();
  };

  return {
    minWei: data ?? 0n,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

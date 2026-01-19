/**
 * Hook to get all SupportSoulbound tokens for a given supporter.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { zeroAddress } from 'viem';
import { supportSoulboundAbi } from '@/lib/contracts/abis';
import { getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface UseSupportTokensResult {
  /** Array of token IDs owned by the supporter */
  tokenIds: bigint[];
  /** The latest (most recently minted) token ID, or null if none */
  latestTokenId: bigint | null;
  /** Loading state (initial load only) */
  isLoading: boolean;
  /** Fetching state (includes refetches) */
  isFetching: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch */
  refetch: () => void;
}

export interface UseSupportTokensOptions {
  /** Supporter address to check (optional - query disabled if undefined) */
  supporter?: Address;
  /** Whether to enable the query */
  enabled?: boolean;
}

/**
 * Gets all SupportSoulbound tokens for a supporter.
 *
 * @example
 * ```tsx
 * const { latestTokenId, isLoading } = useSupportTokens({ supporter: '0x123...' });
 *
 * if (isLoading) return <Spinner />;
 * if (latestTokenId) {
 *   // Use latestTokenId with useTokenURI to display the NFT
 * }
 * ```
 */
export function useSupportTokens({
  supporter,
  enabled = true,
}: UseSupportTokensOptions): UseSupportTokensResult {
  const hubChainId = getHubChainIdForEnvironment();
  const client = usePublicClient({ chainId: hubChainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getSupportSoulboundAddress(hubChainId);
  } catch (err) {
    contractAddress = undefined;
    logger.contract.warn('Failed to resolve SupportSoulbound address', {
      chainId: hubChainId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const queryEnabled =
    enabled &&
    !!contractAddress &&
    contractAddress !== zeroAddress &&
    !!client &&
    !!supporter &&
    supporter !== zeroAddress;

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['soulbound', 'supportTokens', hubChainId, supporter],
    queryFn: async () => {
      if (!client || !contractAddress || !supporter) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Fetching support tokens for supporter', {
        supporter,
        contractAddress,
      });

      const result = await client.readContract({
        address: contractAddress,
        abi: supportSoulboundAbi,
        functionName: 'getTokensForSupporter',
        args: [supporter],
      });

      const tokenIds = result as bigint[];
      logger.contract.debug('Support tokens fetched', {
        supporter,
        count: tokenIds.length,
      });

      return tokenIds;
    },
    enabled: queryEnabled,
    staleTime: 1000 * 30, // 30 seconds - can mint multiple tokens
  });

  // Stable refetch callback to prevent unnecessary effect re-runs
  const refetch = useCallback(() => {
    if (!queryEnabled) return;
    void queryRefetch();
  }, [queryEnabled, queryRefetch]);

  const tokenIds = data ?? [];
  // Latest token is the last one in the array (highest ID)
  const latestTokenId = tokenIds.length > 0 ? tokenIds[tokenIds.length - 1] : null;

  return {
    tokenIds,
    latestTokenId,
    isLoading,
    isFetching,
    isError,
    error: error ?? null,
    refetch,
  };
}

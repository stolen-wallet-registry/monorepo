/**
 * Hook to check if a wallet has already minted a WalletSoulbound token.
 *
 * Note: WalletSoulbound contracts are deployed on the hub chain only.
 * This hook defaults to querying the hub chain regardless of connected chain.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { zeroAddress } from 'viem';
import { walletSoulboundAbi } from '@/lib/contracts/abis';
import { getWalletSoulboundAddress } from '@swr/chains';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface UseHasMintedResult {
  /** Whether the wallet has already minted */
  hasMinted: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch status. No-ops silently when query is disabled (missing address/contract). */
  refetch: () => void;
}

export interface UseHasMintedOptions {
  /** Wallet address to check */
  address?: Address;
  /** Override chain ID to query (defaults to connected chain) */
  chainId?: number;
}

/**
 * Checks if a wallet has already minted its WalletSoulbound token.
 *
 * @example
 * ```tsx
 * const { hasMinted, isLoading } = useHasMinted({ address: '0x...' });
 *
 * if (isLoading) return <Spinner />;
 * if (hasMinted) return <p>You have already minted your soulbound token.</p>;
 * return <MintButton />;
 * ```
 */
export function useHasMinted({
  address,
  chainId: overrideChainId,
}: UseHasMintedOptions = {}): UseHasMintedResult {
  // Default to hub chain since soulbound contracts are only deployed there
  const hubChainId = getHubChainIdForEnvironment();
  const chainId = overrideChainId ?? hubChainId;
  const client = usePublicClient({ chainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getWalletSoulboundAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  const queryEnabled =
    !!address && !!contractAddress && contractAddress !== zeroAddress && !!client;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['soulbound', 'hasMinted', address, chainId],
    queryFn: async () => {
      if (!client || !contractAddress || !address) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Checking hasMinted', { address, chainId, contractAddress });

      const result = await client.readContract({
        address: contractAddress,
        abi: walletSoulboundAbi,
        functionName: 'hasMinted',
        args: [address],
      });

      logger.contract.debug('hasMinted result', { address, hasMinted: result });

      return result;
    },
    enabled: queryEnabled,
    staleTime: 1000 * 30, // 30 seconds
  });

  const refetch: () => void = () => {
    if (!queryEnabled) {
      logger.contract.debug('useHasMinted refetch skipped - query not enabled', {
        address,
        chainId,
        contractAddress,
      });
      return;
    }
    void queryRefetch();
  };

  return {
    hasMinted: data ?? false,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

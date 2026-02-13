/**
 * Hook to check if a wallet is eligible to mint a WalletSoulbound token.
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

export interface UseCanMintResult {
  /** Whether the wallet can mint */
  canMint: boolean;
  /** Reason if cannot mint (e.g., "Already minted", "Not registered") */
  reason: string;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch status. No-ops silently when query is disabled (missing address/contract). */
  refetch: () => void;
}

export interface UseCanMintOptions {
  /** Wallet address to check */
  address?: Address;
  /** Override chain ID to query (defaults to connected chain) */
  chainId?: number;
}

/**
 * Checks if a wallet is eligible to mint a WalletSoulbound token.
 *
 * A wallet can mint if:
 * 1. It is registered or pending in the StolenWalletRegistry
 * 2. It has not already minted a WalletSoulbound token
 *
 * @example
 * ```tsx
 * const { canMint, reason, isLoading } = useCanMint({ address: '0x...' });
 *
 * if (isLoading) return <Spinner />;
 * if (!canMint) return <p>Cannot mint: {reason}</p>;
 * return <MintButton />;
 * ```
 */
export function useCanMint({
  address,
  chainId: overrideChainId,
}: UseCanMintOptions = {}): UseCanMintResult {
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
    queryKey: ['soulbound', 'canMint', address, chainId],
    queryFn: async () => {
      if (!client || !contractAddress || !address) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Checking canMint', { address, chainId, contractAddress });

      const result = await client.readContract({
        address: contractAddress,
        abi: walletSoulboundAbi,
        functionName: 'canMint',
        args: [address],
      });

      const [eligible, reason] = result as [boolean, string];
      logger.contract.debug('canMint result', { address, eligible, reason });

      return { eligible, reason };
    },
    enabled: queryEnabled,
    staleTime: 1000 * 30, // 30 seconds
  });

  const refetch: () => void = () => {
    if (!queryEnabled) {
      logger.contract.debug('useCanMint refetch skipped - query not enabled', {
        address,
        chainId,
        contractAddress,
      });
      return;
    }
    void queryRefetch();
  };

  return {
    canMint: data?.eligible ?? false,
    reason: data?.reason ?? '',
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

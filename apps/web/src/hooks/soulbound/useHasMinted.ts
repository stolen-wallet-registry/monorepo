/**
 * Hook to check if a wallet has already minted a WalletSoulbound token.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useChainId } from 'wagmi';
import { walletSoulboundAbi } from '@/lib/contracts/abis';
import { getWalletSoulboundAddress } from '@/lib/contracts/addresses';
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
  /** Function to refetch status */
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
  const connectedChainId = useChainId();
  const chainId = overrideChainId ?? connectedChainId;
  const client = usePublicClient({ chainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getWalletSoulboundAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  const queryEnabled =
    !!address &&
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

      return result as boolean;
    },
    enabled: queryEnabled,
    staleTime: 1000 * 30, // 30 seconds
  });

  const refetch: () => void = () => {
    if (!queryEnabled) return;
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

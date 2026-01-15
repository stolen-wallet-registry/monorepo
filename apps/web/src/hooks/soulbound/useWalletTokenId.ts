/**
 * Hook to get the tokenId for a wallet that has minted a WalletSoulbound token.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { zeroAddress } from 'viem';
import { walletSoulboundAbi } from '@/lib/contracts/abis';
import { getWalletSoulboundAddress } from '@/lib/contracts/addresses';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface UseWalletTokenIdResult {
  /** Token ID for the wallet (0n if not minted) */
  tokenId: bigint;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch */
  refetch: () => void;
}

export interface UseWalletTokenIdOptions {
  /** Wallet address to check (optional - query disabled if undefined) */
  wallet?: Address;
  /** Whether to enable the query */
  enabled?: boolean;
}

/**
 * Gets the tokenId for a wallet that has minted a WalletSoulbound token.
 *
 * @example
 * ```tsx
 * const { tokenId, isLoading } = useWalletTokenId({ wallet: '0x123...' });
 *
 * if (isLoading) return <Spinner />;
 * if (tokenId > 0n) {
 *   // Use tokenId with useTokenURI to display the NFT
 * }
 * ```
 */
export function useWalletTokenId({
  wallet,
  enabled = true,
}: UseWalletTokenIdOptions): UseWalletTokenIdResult {
  const hubChainId = getHubChainIdForEnvironment();
  const client = usePublicClient({ chainId: hubChainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getWalletSoulboundAddress(hubChainId);
  } catch {
    contractAddress = undefined;
  }

  const queryEnabled =
    enabled &&
    !!contractAddress &&
    contractAddress !== zeroAddress &&
    !!client &&
    !!wallet &&
    wallet !== zeroAddress;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['soulbound', 'walletTokenId', wallet],
    queryFn: async () => {
      if (!client || !contractAddress || !wallet) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Fetching tokenId for wallet', {
        wallet,
        contractAddress,
      });

      const result = await client.readContract({
        address: contractAddress,
        abi: walletSoulboundAbi,
        functionName: 'getTokenIdForWallet',
        args: [wallet],
      });

      logger.contract.debug('Wallet tokenId fetched', {
        wallet,
        tokenId: (result as bigint).toString(),
      });

      return result as bigint;
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60, // 1 minute
  });

  const refetch: () => void = () => {
    if (!queryEnabled) return;
    void queryRefetch();
  };

  return {
    tokenId: data ?? 0n,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

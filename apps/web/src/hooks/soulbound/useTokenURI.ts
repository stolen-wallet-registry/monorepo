/**
 * Hook to fetch and decode a soulbound token's on-chain metadata and SVG.
 *
 * Calls tokenURI(tokenId) on the contract and decodes the base64 response
 * to extract the metadata JSON and embedded SVG image.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { walletSoulboundAbi, supportSoulboundAbi } from '@/lib/contracts/abis';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

/** Decoded token metadata */
export interface TokenMetadata {
  /** Token name (e.g., "Stolen Wallet #42") */
  name: string;
  /** Token description */
  description: string;
  /** Raw SVG string (decoded from base64) */
  image: string;
  /** Any additional attributes */
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export interface UseTokenURIResult {
  /** Decoded metadata from tokenURI */
  metadata: TokenMetadata | null;
  /** Raw SVG string ready to render */
  svg: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch */
  refetch: () => void;
}

export interface UseTokenURIOptions {
  /** Contract address to query */
  contractAddress: Address;
  /** Token ID to fetch metadata for */
  tokenId: bigint;
  /** Token type to determine which ABI to use */
  type: 'wallet' | 'support';
  /** Whether to enable the query */
  enabled?: boolean;
}

/**
 * Decode a base64 data URI to its content.
 * Handles both JSON and SVG data URIs.
 */
function decodeDataUri(dataUri: string): string {
  // data:application/json;base64,{content}
  // data:image/svg+xml;base64,{content}
  const match = dataUri.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URI format');
  }
  return atob(match[1]);
}

/**
 * Fetches and decodes a soulbound token's on-chain metadata.
 *
 * The tokenURI returns a base64-encoded JSON containing:
 * - name: Token name
 * - description: Token description
 * - image: Base64-encoded SVG
 *
 * @example
 * ```tsx
 * const { svg, metadata, isLoading } = useTokenURI({
 *   contractAddress: walletSoulboundAddress,
 *   tokenId: 42n,
 *   type: 'wallet',
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (svg) return <div dangerouslySetInnerHTML={{ __html: svg }} />;
 * ```
 */
export function useTokenURI({
  contractAddress,
  tokenId,
  type,
  enabled = true,
}: UseTokenURIOptions): UseTokenURIResult {
  const hubChainId = getHubChainIdForEnvironment();
  const client = usePublicClient({ chainId: hubChainId });

  const abi = type === 'wallet' ? walletSoulboundAbi : supportSoulboundAbi;
  const queryEnabled = enabled && !!contractAddress && !!client && tokenId >= 0n;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['soulbound', 'tokenURI', contractAddress, tokenId.toString()],
    queryFn: async () => {
      if (!client || !contractAddress) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Fetching tokenURI', {
        contractAddress,
        tokenId: tokenId.toString(),
        type,
      });

      // Call tokenURI(tokenId) on the contract
      const tokenUriResult = await client.readContract({
        address: contractAddress,
        abi,
        functionName: 'tokenURI',
        args: [tokenId],
      });

      const dataUri = tokenUriResult as string;
      logger.contract.debug('tokenURI fetched', {
        tokenId: tokenId.toString(),
        uriLength: dataUri.length,
      });

      // Decode the base64 JSON
      const jsonString = decodeDataUri(dataUri);
      const metadata = JSON.parse(jsonString) as TokenMetadata & { image: string };

      // Decode the base64 SVG from the image field
      let svg: string;
      if (metadata.image.startsWith('data:image/svg+xml;base64,')) {
        svg = decodeDataUri(metadata.image);
      } else {
        // If image is not a data URI, use it directly
        svg = metadata.image;
      }

      logger.contract.debug('tokenURI decoded', {
        name: metadata.name,
        svgLength: svg.length,
      });

      return { metadata, svg };
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 60, // 1 hour - token metadata doesn't change
  });

  const refetch: () => void = () => {
    if (!queryEnabled) return;
    void queryRefetch();
  };

  return {
    metadata: data?.metadata ?? null,
    svg: data?.svg ?? null,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

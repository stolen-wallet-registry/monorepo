/**
 * Hook to query supported languages from the TranslationRegistry contract.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useChainId } from 'wagmi';
import { translationRegistryAbi } from '@/lib/contracts/abis';
import { getTranslationRegistryAddress } from '@/lib/contracts/addresses';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface UseSupportedLanguagesResult {
  /** Array of supported language codes (e.g., ['en', 'es', 'zh']) */
  languages: string[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch languages */
  refetch: () => void;
}

export interface UseSupportedLanguagesOptions {
  /** Override chain ID to query (defaults to connected chain) */
  chainId?: number;
  /** Whether to enable the query */
  enabled?: boolean;
}

/**
 * Queries supported languages from the TranslationRegistry contract.
 *
 * @example
 * ```tsx
 * const { languages, isLoading } = useSupportedLanguages();
 *
 * if (isLoading) return <Spinner />;
 * return (
 *   <select>
 *     {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
 *   </select>
 * );
 * ```
 */
export function useSupportedLanguages({
  chainId: overrideChainId,
  enabled = true,
}: UseSupportedLanguagesOptions = {}): UseSupportedLanguagesResult {
  const connectedChainId = useChainId();
  const chainId = overrideChainId ?? connectedChainId;
  const client = usePublicClient({ chainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getTranslationRegistryAddress(chainId);
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
    queryKey: ['soulbound', 'languages', chainId],
    queryFn: async () => {
      if (!client || !contractAddress) {
        throw new Error('Missing required parameters');
      }

      logger.contract.debug('Fetching supported languages', { chainId, contractAddress });

      const result = await client.readContract({
        address: contractAddress,
        abi: translationRegistryAbi,
        functionName: 'getSupportedLanguages',
      });

      logger.contract.debug('Supported languages fetched', { languages: result });

      return result as string[];
    },
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes - languages don't change often
  });

  const refetch: () => void = () => {
    if (!queryEnabled) return;
    void queryRefetch();
  };

  return {
    languages: data ?? [],
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

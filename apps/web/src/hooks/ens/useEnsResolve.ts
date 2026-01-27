/**
 * ENS resolve hook for resolving ENS names to addresses.
 */

import { useEnsAddress } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { normalize } from 'viem/ens';
import type { Address } from '@/lib/types/ethereum';

/**
 * Query options for ENS resolution.
 * Aggressive caching since ENS names rarely change.
 */
const ENS_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
  retry: 1, // Single retry on failure
  retryDelay: 1000, // 1 second delay
};

export interface EnsResolveResult {
  /** Resolved address, or null if not found */
  address: Address | null;
  /** Whether resolution is in progress */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** Error message if any */
  error: Error | null;
}

/**
 * Resolves ENS name to address.
 *
 * @param name - ENS name to resolve (e.g., "vitalik.eth")
 * @returns Resolved address or null
 *
 * @example
 * ```tsx
 * const { address, isLoading, isError } = useEnsResolve(ensName);
 *
 * if (isLoading) return <Spinner />;
 * if (isError) return <span>Could not resolve ENS name</span>;
 * if (address) return <span>Resolved: {address}</span>;
 * ```
 */
export function useEnsResolve(name: string | undefined): EnsResolveResult {
  // Normalize the ENS name (handles unicode, trailing dots, etc.)
  let normalizedName: string | undefined;
  try {
    normalizedName = name ? normalize(name) : undefined;
  } catch {
    // Invalid ENS name format
    normalizedName = undefined;
  }

  const {
    data: address,
    isLoading,
    isError,
    error,
  } = useEnsAddress({
    name: normalizedName,
    chainId: mainnet.id,
    query: {
      ...ENS_QUERY_OPTIONS,
      enabled: !!normalizedName,
    },
  });

  return {
    address: address ?? null,
    isLoading,
    isError,
    error: error ?? null,
  };
}

/**
 * ENS display hook for resolving addresses to ENS names.
 */

import { useEnsName, useEnsAvatar } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { normalize } from 'viem/ens';
import type { Address } from '@/lib/types/ethereum';
import { ENS_QUERY_OPTIONS } from './constants';

export interface EnsDisplayData {
  /** Resolved ENS name, or null if none */
  name: string | null;
  /** Avatar URL, or null if none */
  avatar: string | null;
  /** Whether ENS name is loading */
  isLoading: boolean;
  /** Whether there was an error resolving */
  isError: boolean;
}

export interface UseEnsDisplayOptions {
  /** Whether to also fetch avatar (default: false) */
  includeAvatar?: boolean;
}

/**
 * Resolves ENS name and avatar for an address.
 *
 * @param address - Ethereum address to resolve
 * @param options.includeAvatar - Whether to also fetch avatar (default: false)
 * @returns ENS display data with name and optional avatar
 *
 * @example
 * ```tsx
 * const { name, avatar, isLoading } = useEnsDisplay(address, { includeAvatar: true });
 *
 * if (isLoading) return <Skeleton />;
 * return name ? <span>{name}</span> : <span>{truncateAddress(address)}</span>;
 * ```
 */
export function useEnsDisplay(
  address: Address | undefined,
  options: UseEnsDisplayOptions = {}
): EnsDisplayData {
  const { includeAvatar = false } = options;

  // Resolve address -> ENS name (always uses mainnet)
  const {
    data: name,
    isLoading: isNameLoading,
    isError: isNameError,
  } = useEnsName({
    address,
    chainId: mainnet.id,
    query: {
      ...ENS_QUERY_OPTIONS,
      enabled: !!address,
    },
  });

  // Normalize name for avatar lookup
  let normalizedName: string | undefined;
  if (name) {
    try {
      normalizedName = normalize(name);
    } catch {
      // Invalid name, skip avatar lookup
      normalizedName = undefined;
    }
  }

  // Resolve ENS name -> avatar (only if name exists and includeAvatar is true)
  const { data: avatar, isLoading: isAvatarLoading } = useEnsAvatar({
    name: normalizedName,
    chainId: mainnet.id,
    query: {
      ...ENS_QUERY_OPTIONS,
      enabled: includeAvatar && !!normalizedName,
    },
  });

  return {
    name: name ?? null,
    avatar: includeAvatar ? (avatar ?? null) : null,
    isLoading: isNameLoading || (includeAvatar && isAvatarLoading),
    isError: isNameError,
  };
}

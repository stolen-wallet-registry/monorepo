/**
 * ENS display hook for resolving addresses to ENS names.
 */

import { useEnsName, useEnsAvatar } from 'wagmi';
import { normalize } from 'viem/ens';
import type { Address } from '@/lib/types/ethereum';
import { ensConfig, isEnsEnabled } from '@/lib/ens-config';
import { isDisplaySafeEnsName } from '@/lib/ens';
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

  // Resolve address -> ENS name (uses dedicated mainnet-only config)
  const {
    data: name,
    isLoading: isNameLoading,
    isError: isNameError,
  } = useEnsName({
    address,
    ...(ensConfig ? { config: ensConfig } : {}),
    query: {
      ...ENS_QUERY_OPTIONS,
      enabled: isEnsEnabled && !!address,
    },
  });

  // A name that is not safe to substitute for an address is dropped entirely rather than
  // displayed with a caveat: every consumer of this hook renders the name in the address
  // slot, so returning it at all is what creates the impersonation. Callers fall back to the
  // hex address, which is the thing the user can actually verify.
  const displayName = isDisplaySafeEnsName(name) ? name : null;

  // Normalize for the avatar lookup — gated on the same check, so a rejected name does not
  // get to put an attacker-chosen image next to the address either.
  let normalizedName: string | undefined;
  if (displayName) {
    try {
      normalizedName = normalize(displayName);
    } catch {
      // Invalid name, skip avatar lookup
      normalizedName = undefined;
    }
  }

  // Resolve ENS name -> avatar (only if name exists and includeAvatar is true)
  const { data: avatar, isLoading: isAvatarLoading } = useEnsAvatar({
    name: normalizedName,
    ...(ensConfig ? { config: ensConfig } : {}),
    query: {
      ...ENS_QUERY_OPTIONS,
      enabled: isEnsEnabled && includeAvatar && !!normalizedName,
    },
  });

  return {
    name: displayName,
    avatar: includeAvatar ? (avatar ?? null) : null,
    isLoading: isNameLoading || (includeAvatar && isAvatarLoading),
    isError: isNameError,
  };
}

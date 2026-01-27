/**
 * ExplorerLink wrapper that automatically resolves ENS names.
 *
 * Use this instead of ExplorerLink when displaying addresses that
 * might have ENS names. It handles the ENS resolution automatically.
 */

import { ExplorerLink, type ExplorerLinkProps } from '@swr/ui';
import { useEnsDisplay } from '@/hooks/ens';
import type { Address } from '@/lib/types/ethereum';

export interface EnsExplorerLinkProps extends Omit<ExplorerLinkProps, 'ensName' | 'ensLoading'> {
  /** The address to display and resolve ENS for */
  value: Address;
  /** Whether to resolve ENS name (default: true) */
  resolveEns?: boolean;
}

/**
 * ExplorerLink with automatic ENS name resolution.
 *
 * @example
 * ```tsx
 * // Shows "vitalik.eth" instead of "0xd8dA..." if ENS name exists
 * <EnsExplorerLink value={address} />
 *
 * // Disable ENS resolution
 * <EnsExplorerLink value={address} resolveEns={false} />
 * ```
 */
export function EnsExplorerLink({
  value,
  resolveEns = true,
  type = 'address',
  ...props
}: EnsExplorerLinkProps) {
  // Only resolve ENS for address types
  const shouldResolve = resolveEns && type === 'address';

  const { name, isLoading } = useEnsDisplay(shouldResolve ? value : undefined);

  return (
    <ExplorerLink
      value={value}
      type={type}
      ensName={shouldResolve ? name : null}
      ensLoading={shouldResolve ? isLoading : false}
      {...props}
    />
  );
}

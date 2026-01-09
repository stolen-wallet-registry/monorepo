/**
 * Chain indicator badge for cross-chain development.
 *
 * Displays the current connected chain with visual distinction between
 * hub and spoke chains. Only visible in cross-chain mode.
 */

import { useChainId, useAccount } from 'wagmi';
import { Badge } from '@swr/ui';
import { isCrossChainMode } from '@/lib/wagmi';
import { isHubChain, isSpokeChain } from '@/lib/chains/config';
import { cn } from '@/lib/utils';

export interface ChainIndicatorProps {
  /** Additional class names */
  className?: string;
  /** Show even when not in cross-chain mode (for testing) */
  forceShow?: boolean;
}

/**
 * Badge showing current chain (Hub/Spoke).
 *
 * Features:
 * - Only visible in cross-chain mode (VITE_CROSSCHAIN=true)
 * - Blue badge for hub chain, green for spoke
 * - Shows "Not Connected" when no wallet connected
 *
 * @example
 * ```tsx
 * // In Header.tsx
 * <ChainIndicator />
 *
 * // Force show for testing
 * <ChainIndicator forceShow />
 * ```
 */
export function ChainIndicator({ className, forceShow = false }: ChainIndicatorProps) {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  // Only show in cross-chain mode (unless forced for testing)
  if (!isCrossChainMode && !forceShow) {
    return null;
  }

  // Not connected state
  if (!isConnected) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        <span aria-label="Wallet connection status">Not Connected</span>
      </Badge>
    );
  }

  // Hub chain (Base mainnet, Base Sepolia, Anvil Hub)
  if (isHubChain(chainId)) {
    return (
      <Badge variant="default" className={cn('bg-blue-500 hover:bg-blue-600', className)}>
        Hub Chain
      </Badge>
    );
  }

  // Spoke chain (any non-hub chain)
  if (isSpokeChain(chainId)) {
    return (
      <Badge
        variant="secondary"
        className={cn('bg-green-500 hover:bg-green-600 text-white', className)}
      >
        Spoke Chain
      </Badge>
    );
  }

  // Fallback for unknown chains (shouldn't happen since isSpokeChain returns true for non-hub)
  return (
    <Badge variant="outline" className={cn('text-muted-foreground', className)}>
      Chain {chainId}
    </Badge>
  );
}

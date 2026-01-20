/**
 * Chain icon component for displaying network logos.
 *
 * Maps chain IDs to their respective network icons with consistent styling.
 * Supports multiple sizes and optional circular badge wrapper.
 */

import { NetworkEthereum, NetworkBase, NetworkOptimism } from '@swr/ui';
import { cn } from '@/lib/utils';

export type ChainIconSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ChainIconProps {
  /** The chain ID to display an icon for */
  chainId: number;
  /** Size variant */
  size?: ChainIconSize;
  /** Whether to wrap in a circular badge */
  badge?: boolean;
  /** Additional class names for the icon */
  className?: string;
}

const SIZE_CLASSES: Record<ChainIconSize, string> = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
};

const BADGE_SIZE_CLASSES: Record<ChainIconSize, string> = {
  xs: 'size-5',
  sm: 'size-6',
  md: 'size-7',
  lg: 'size-8',
};

/**
 * Get the network icon component for a chain ID.
 */
function getNetworkIcon(chainId: number, sizeClass: string) {
  switch (chainId) {
    // Base
    case 8453: // Base mainnet
    case 84532: // Base Sepolia
      return <NetworkBase className={sizeClass} />;
    // Optimism
    case 10: // Optimism mainnet
    case 11155420: // Optimism Sepolia
      return <NetworkOptimism className={sizeClass} />;
    // Ethereum and fallback (local anvil chains, etc.)
    case 1: // Ethereum mainnet
    case 11155111: // Sepolia
    case 31337: // Anvil Hub (local)
    case 31338: // Anvil Spoke (local)
    default:
      return <NetworkEthereum className={sizeClass} />;
  }
}

/**
 * Displays a network icon for a given chain ID.
 *
 * @example
 * ```tsx
 * // Simple icon
 * <ChainIcon chainId={8453} />
 *
 * // With badge wrapper
 * <ChainIcon chainId={8453} badge />
 *
 * // Larger size
 * <ChainIcon chainId={8453} size="md" badge />
 * ```
 */
export function ChainIcon({ chainId, size = 'xs', badge = false, className }: ChainIconProps) {
  const iconSizeClass = SIZE_CLASSES[size];
  const icon = getNetworkIcon(chainId, iconSizeClass);

  if (badge) {
    const badgeSizeClass = BADGE_SIZE_CLASSES[size];
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
          badgeSizeClass,
          className
        )}
      >
        {icon}
      </span>
    );
  }

  return <span className={cn('inline-flex', className)}>{icon}</span>;
}

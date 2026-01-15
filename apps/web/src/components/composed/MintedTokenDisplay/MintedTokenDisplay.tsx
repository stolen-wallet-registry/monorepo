/**
 * Component to display a minted soulbound token's on-chain SVG.
 *
 * Fetches the tokenURI and renders the embedded SVG artwork.
 */

import { useTokenURI } from '@/hooks/soulbound';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';

export interface MintedTokenDisplayProps {
  /** Contract address of the soulbound token */
  contractAddress: Address;
  /** Token ID to display */
  tokenId: bigint;
  /** Type of token (for ABI selection) */
  type: 'wallet' | 'support';
  /** Size of the SVG display (default: 200) */
  size?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Fetches and displays a minted soulbound token's on-chain SVG.
 *
 * @example
 * ```tsx
 * <MintedTokenDisplay
 *   contractAddress={walletSoulboundAddress}
 *   tokenId={42n}
 *   type="wallet"
 *   size={200}
 * />
 * ```
 */
export function MintedTokenDisplay({
  contractAddress,
  tokenId,
  type,
  size = 200,
  className,
}: MintedTokenDisplayProps) {
  const { svg, isLoading, isError, error } = useTokenURI({
    contractAddress,
    tokenId,
    type,
    enabled: tokenId > 0n,
  });

  if (isLoading) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg bg-muted', className)}
        style={{ width: size, height: size }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !svg) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground',
          className
        )}
        style={{ width: size, height: size }}
      >
        {error?.message ?? 'Failed to load NFT'}
      </div>
    );
  }

  // Render the SVG safely via <img> tag (defense-in-depth)
  // Using data URL prevents any script execution since images can't run JS
  // Note: No overflow-hidden or rounded corners - the SVG has animated border at y=12
  // which would be clipped by CSS border-radius
  // Use encodeURIComponent + unescape to handle UTF-8 characters (multilingual text)
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  return (
    <img
      src={svgDataUrl}
      alt="Soulbound Token"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

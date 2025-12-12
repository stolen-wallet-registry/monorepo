/**
 * Explorer link component for displaying blockchain hashes/addresses with links.
 *
 * Renders a truncated hash or address with an external link icon that opens
 * the block explorer. Shows disabled icon when no URL is provided (e.g., local chains).
 */

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExplorerLinkProps {
  /** The hash or address to display */
  value: `0x${string}`;
  /** Explorer URL (if null/undefined, shows disabled icon) */
  href?: string | null;
  /** Whether to truncate the display (default: true) */
  truncate?: boolean;
  /** Whether to show the external link icon when disabled (default: true) */
  showDisabledIcon?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Displays a blockchain hash or address with optional explorer link.
 * Shows a disabled external link icon for local chains without explorers.
 */
export function ExplorerLink({
  value,
  href,
  truncate = true,
  showDisabledIcon = true,
  className,
}: ExplorerLinkProps) {
  const displayValue = truncate ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;

  if (!href) {
    return (
      <span className={cn('font-mono text-sm inline-flex items-center gap-1.5', className)}>
        {displayValue}
        {showDisabledIcon && (
          <ExternalLink
            className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40"
            aria-label="No block explorer available for this network"
          />
        )}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'font-mono text-sm inline-flex items-center gap-1.5 hover:text-primary transition-colors',
        className
      )}
    >
      {displayValue}
      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
    </a>
  );
}

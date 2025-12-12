/**
 * Explorer link component for displaying blockchain hashes/addresses with links.
 *
 * Features:
 * - Truncated display with full address searchable via Ctrl+F
 * - Native browser highlight works on visible start/end portions
 * - Tooltip on hover showing full address for copying
 * - Disabled icon for local chains without explorers
 */

import { ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  /** Whether to show tooltip with full value on hover (default: true when truncated) */
  showTooltip?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Searchable truncated address using CSS clipping.
 * Full address is in DOM twice (start + end portions) for Ctrl+F searchability.
 * RTL direction trick right-aligns the end portion to show last 8 chars.
 */
function TruncatedAddress({ value }: { value: string }) {
  return (
    <span className="inline-flex whitespace-nowrap" aria-label={value}>
      {/* Start: first 10 chars visible */}
      <span className="inline-block overflow-hidden" style={{ width: '10ch' }}>
        {value}
      </span>
      <span>...</span>
      {/* End: last 8 chars visible via RTL alignment */}
      <span className="inline-block overflow-hidden" style={{ width: '8ch', direction: 'rtl' }}>
        <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>{value}</span>
      </span>
    </span>
  );
}

/**
 * Displays a blockchain hash or address with optional explorer link.
 *
 * When truncated, tooltip shows full address on hover for easy copying.
 */
export function ExplorerLink({
  value,
  href,
  truncate = true,
  showDisabledIcon = true,
  showTooltip = true,
  className,
}: ExplorerLinkProps) {
  const shouldShowTooltip = truncate && showTooltip;

  // Content display (truncated or full)
  const displayContent = truncate ? <TruncatedAddress value={value} /> : value;

  // Core content (link or span)
  const content = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="explorer-link"
      className={cn(
        'font-mono text-sm inline-flex items-center gap-1.5 hover:text-primary transition-colors',
        className
      )}
    >
      {displayContent}
      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
    </a>
  ) : (
    <span
      data-testid="explorer-link"
      className={cn('font-mono text-sm inline-flex items-center gap-1.5', className)}
    >
      {displayContent}
      {showDisabledIcon && (
        <ExternalLink
          className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40"
          aria-label="No block explorer available for this network"
        />
      )}
    </span>
  );

  // Wrap in tooltip if truncated
  if (!shouldShowTooltip) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[400px]">
        <p className="font-mono text-xs break-all">{value}</p>
      </TooltipContent>
    </Tooltip>
  );
}

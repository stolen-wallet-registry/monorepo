/**
 * Explorer link component for displaying blockchain hashes/addresses with links.
 *
 * Features:
 * - Truncated display with full address searchable via Ctrl+F
 * - Native browser highlight works on visible start/end portions
 * - Copy to clipboard button for easy copying
 * - Disabled icon with tooltip for local chains without explorers
 */

import { useState, useCallback } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
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
  /** Whether to show copy button (default: true) */
  showCopyButton?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Searchable truncated address using CSS clipping.
 * Full address is in DOM twice (start + end portions) for Ctrl+F searchability.
 * RTL direction trick right-aligns the end portion to show last 8 chars.
 * Screen readers get a single accessible name via sr-only span.
 */
function TruncatedAddress({ value }: { value: string }) {
  return (
    <span className="inline-flex whitespace-nowrap">
      {/* Accessible name for screen readers */}
      <span className="sr-only">{value}</span>
      {/* Start: first 10 chars visible */}
      <span aria-hidden="true" className="inline-block overflow-hidden" style={{ width: '10ch' }}>
        {value}
      </span>
      <span aria-hidden="true">...</span>
      {/* End: last 8 chars visible via RTL alignment */}
      <span
        aria-hidden="true"
        className="inline-block overflow-hidden"
        style={{ width: '8ch', direction: 'rtl' }}
      >
        <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>{value}</span>
      </span>
    </span>
  );
}

/**
 * Displays a blockchain hash or address with optional explorer link.
 * Includes copy button and optional explorer link.
 */
export function ExplorerLink({
  value,
  href,
  truncate = true,
  showDisabledIcon = true,
  showCopyButton = true,
  className,
}: ExplorerLinkProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  // Content display (truncated or full)
  const displayContent = truncate ? <TruncatedAddress value={value} /> : value;

  return (
    <span
      data-testid="explorer-link"
      className={cn('font-mono text-sm inline-flex items-center gap-1.5', className)}
    >
      {displayContent}

      {/* Copy button with tooltip */}
      {showCopyButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              aria-label={copied ? 'Copied!' : 'Copy address'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 flex-shrink-0" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{copied ? 'Copied!' : 'Copy address'}</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Explorer link with tooltip, or disabled icon */}
      {href ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
              aria-label="View on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">View on explorer</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        showDisabledIcon && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-not-allowed">
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">No explorer available for this network</p>
            </TooltipContent>
          </Tooltip>
        )
      )}
    </span>
  );
}

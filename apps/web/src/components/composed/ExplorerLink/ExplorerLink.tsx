/**
 * Explorer link component for displaying blockchain hashes/addresses with links.
 *
 * Features:
 * - Truncated display with full address searchable via Ctrl+F
 * - Native browser highlight works on visible start/end portions
 * - Copy to clipboard button for easy copying
 * - Disabled icon with tooltip for local chains without explorers
 * - Type-aware labels for addresses, transactions, and contracts
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { cn } from '@/lib/utils';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/**
 * Type of blockchain identifier.
 * - 'address': Wallet or contract address (42 chars: 0x + 40 hex)
 * - 'transaction': Transaction hash (66 chars: 0x + 64 hex)
 * - 'contract': Smart contract address (same format as address, semantic distinction)
 * - 'block': Block hash (66 chars, same as transaction)
 * - 'token': Token contract address (same format as address)
 * - 'message': Cross-chain message ID (66 chars, same as transaction)
 *
 * NOTE: 'message' type must be explicitly specified via the type prop.
 * Auto-inference cannot distinguish message IDs from transaction hashes
 * since both are 66 chars. Without explicit type, message IDs will be
 * inferred as 'transaction' and display transaction-specific labels.
 */
export type ExplorerLinkType =
  | 'address'
  | 'transaction'
  | 'contract'
  | 'block'
  | 'token'
  | 'message';

/**
 * Human-readable labels for each type.
 */
const TYPE_LABELS: Record<ExplorerLinkType, { copy: string; view: string }> = {
  address: { copy: 'Copy address', view: 'View address on explorer' },
  transaction: { copy: 'Copy transaction hash', view: 'View transaction on explorer' },
  contract: { copy: 'Copy contract address', view: 'View contract on explorer' },
  block: { copy: 'Copy block hash', view: 'View block on explorer' },
  token: { copy: 'Copy token address', view: 'View token on explorer' },
  message: { copy: 'Copy message ID', view: 'View message on explorer' },
};

/**
 * Infer type from value length if not explicitly provided.
 * - 42 chars (0x + 40 hex) = address
 * - 66 chars (0x + 64 hex) = transaction hash
 */
function inferType(value: string): ExplorerLinkType {
  // Transaction hashes are 66 chars (0x + 64 hex chars)
  if (value.length === 66) {
    return 'transaction';
  }
  // Addresses are 42 chars (0x + 40 hex chars)
  return 'address';
}

export interface ExplorerLinkProps {
  /** The hash or address to display (accepts Address, Hash, or generic Hex) */
  value: Address | Hash | Hex;
  /** Type of value - inferred from length if not provided */
  type?: ExplorerLinkType;
  /** Explorer URL (if null/undefined, shows disabled icon) */
  href?: string | null;
  /** Whether to truncate the display (default: true for addresses, false for short values) */
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
 *
 * Note: dir="ltr" on parent isolates the RTL trick from actual RTL language users.
 */
function TruncatedAddress({ value }: { value: string }) {
  return (
    <span className="inline-flex whitespace-nowrap" dir="ltr">
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
 * Includes copy button and optional explorer link with type-aware labels.
 */
export function ExplorerLink({
  value,
  type,
  href,
  truncate = true,
  showDisabledIcon = true,
  showCopyButton = true,
  className,
}: ExplorerLinkProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Determine type from prop or infer from value length
  const resolvedType = type ?? inferType(value);
  const labels = TYPE_LABELS[resolvedType];

  const handleCopy = useCallback(async () => {
    // Guard for SSR and clipboard API availability
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // Clear any existing timeout before creating a new one (handles rapid clicks)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [value]);

  // Content display (truncated or full)
  const displayContent = truncate ? <TruncatedAddress value={value} /> : value;

  return (
    <span
      data-testid="explorer-link"
      className={cn('font-mono text-sm inline-flex items-center gap-1.5', className)}
    >
      {/* Full value tooltip on hover for truncated display */}
      {truncate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">{displayContent}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md">
            <p className="text-xs font-mono break-all">{value}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        displayContent
      )}

      {/* Copy button with tooltip */}
      {showCopyButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              data-testid="copy-button"
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              aria-label={copied ? 'Copied!' : labels.copy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{copied ? 'Copied!' : labels.copy}</p>
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
              aria-label={labels.view}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{labels.view}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        showDisabledIcon && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-not-allowed">
                <ExternalLink
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
                  aria-hidden="true"
                />
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

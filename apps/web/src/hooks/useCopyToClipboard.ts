/**
 * Hook for copying text to clipboard with optional auto-reset.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/lib/logger';

type CopiedValue = string | null;
type CopyFn = (text: string) => Promise<boolean>;

export interface UseCopyToClipboardOptions {
  /** Auto-reset copied state after this many milliseconds (0 = no auto-reset) */
  resetMs?: number;
}

export interface UseCopyToClipboardResult {
  /** The last copied value, or null if nothing has been copied */
  copiedValue: CopiedValue;
  /** Whether text was recently copied (useful for UI feedback) */
  copied: boolean;
  /** Function to copy text to clipboard */
  copy: CopyFn;
  /** Reset the copied value state */
  reset: () => void;
}

/**
 * Hook for copying text to clipboard.
 *
 * @param options - Configuration options
 * @param options.resetMs - Auto-reset after this many ms (default: 0 = no auto-reset)
 *
 * @example
 * ```tsx
 * // With auto-reset after 2 seconds
 * const { copied, copy } = useCopyToClipboard({ resetMs: 2000 });
 *
 * <button onClick={() => copy(value)}>
 *   {copied ? 'Copied!' : 'Copy'}
 * </button>
 * ```
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardResult {
  const { resetMs = 0 } = options;
  const [copiedValue, setCopiedValue] = useState<CopiedValue>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy: CopyFn = useCallback(
    async (text: string) => {
      // Guard for SSR and clipboard API availability
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        logger.ui.warn('Clipboard API not supported');
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopiedValue(text);
        logger.ui.debug('Text copied to clipboard', { length: text.length });

        // Auto-reset if configured
        if (resetMs > 0) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            setCopiedValue(null);
          }, resetMs);
        }

        return true;
      } catch (error) {
        logger.ui.error('Failed to copy to clipboard', {}, error as Error);
        setCopiedValue(null);
        return false;
      }
    },
    [resetMs]
  );

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCopiedValue(null);
  }, []);

  return {
    copiedValue,
    copied: copiedValue !== null,
    copy,
    reset,
  };
}

/**
 * Hook for copying text to clipboard.
 */

import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

type CopiedValue = string | null;
type CopyFn = (text: string) => Promise<boolean>;

export interface UseCopyToClipboardResult {
  /** The last copied value, or null if nothing has been copied */
  copiedValue: CopiedValue;
  /** Function to copy text to clipboard */
  copy: CopyFn;
  /** Reset the copied value state */
  reset: () => void;
}

/**
 * Hook for copying text to clipboard.
 *
 * @example
 * ```tsx
 * const { copiedValue, copy } = useCopyToClipboard();
 *
 * const handleCopy = async () => {
 *   const success = await copy('Hello, World!');
 *   if (success) {
 *     toast({ title: 'Copied!' });
 *   }
 * };
 * ```
 */
export function useCopyToClipboard(): UseCopyToClipboardResult {
  const [copiedValue, setCopiedValue] = useState<CopiedValue>(null);

  const copy: CopyFn = useCallback(async (text: string) => {
    if (!navigator?.clipboard) {
      logger.ui.warn('Clipboard API not supported');
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedValue(text);
      logger.ui.debug('Text copied to clipboard', { length: text.length });
      return true;
    } catch (error) {
      logger.ui.error('Failed to copy to clipboard', {}, error as Error);
      setCopiedValue(null);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setCopiedValue(null);
  }, []);

  return { copiedValue, copy, reset };
}

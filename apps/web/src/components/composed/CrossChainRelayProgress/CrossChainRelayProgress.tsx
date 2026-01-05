/**
 * Cross-chain relay progress component.
 *
 * Displays the status of a cross-chain message being relayed from spoke to hub chain.
 * Shows animated globe icon, elapsed time, message ID with explorer link, and progress bar.
 */

import { Globe, Loader2 } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import type { Hash } from '@/lib/types/ethereum';

export interface CrossChainRelayProgressProps {
  /** Time elapsed since relay started (ms) */
  elapsedTime: number;
  /** Target hub chain name for display */
  hubChainName?: string;
  /** Bridge name (e.g., "Hyperlane") */
  bridgeName?: string;
  /** Cross-chain message ID (for explorer link) */
  messageId?: Hash;
  /** Bridge explorer URL for the message */
  explorerUrl?: string | null;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format elapsed time for display (clamp to zero to handle edge cases).
 */
function formatElapsedTime(ms: number): string {
  const clampedMs = Math.max(ms, 0);
  const seconds = Math.floor(clampedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Displays cross-chain relay progress with animated status.
 *
 * Shows:
 * - Animated globe icon with pulse + ping effect
 * - "Cross-Chain Relay in Progress" header
 * - Message ID with explorer link (when available)
 * - Elapsed time display
 * - "Polling hub chain..." indicator
 * - Indeterminate progress bar
 */
export function CrossChainRelayProgress({
  elapsedTime,
  hubChainName = 'the hub chain',
  bridgeName = 'Bridge',
  messageId,
  explorerUrl,
  className,
}: CrossChainRelayProgressProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 space-y-3',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Globe className="h-5 w-5 text-blue-500 motion-safe:animate-pulse" />
          <div className="absolute inset-0 motion-safe:animate-ping">
            <Globe className="h-5 w-5 text-blue-400 opacity-30" />
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Cross-Chain Relay in Progress
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {bridgeName} is delivering your registration to {hubChainName}
          </p>
        </div>
      </div>

      {/* Message ID with explorer link */}
      {messageId && (
        <div className="rounded bg-blue-100 dark:bg-blue-900 p-2">
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Message ID</p>
          <ExplorerLink value={messageId} type="message" href={explorerUrl} />
        </div>
      )}

      <div
        className="flex items-center justify-between text-xs"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="text-blue-600 dark:text-blue-400">
          Elapsed: {formatElapsedTime(elapsedTime)}
        </span>
        <span className="text-blue-500 dark:text-blue-500 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Polling hub chain...
        </span>
      </div>

      {/* Progress bar (indeterminate pulse) */}
      <div className="h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
        <div className="h-full w-[40%] bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 rounded-full animate-indeterminate" />
      </div>
    </div>
  );
}

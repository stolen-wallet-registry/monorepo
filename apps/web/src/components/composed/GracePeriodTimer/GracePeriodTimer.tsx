/**
 * Grace period countdown timer component.
 *
 * Displays time remaining until registration can proceed,
 * with both time-based and block-based countdown.
 */

import { Progress, Skeleton } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { cn } from '@/lib/utils';
import { formatTimeString, type TimeRemaining } from '@/lib/blocks';
import type { GracePeriodStatus } from './status';

export interface GracePeriodTimerProps {
  /** Time breakdown from useCountdownTimer */
  timeRemaining: TimeRemaining;
  /** Total milliseconds remaining */
  totalMs: number;
  /** Blocks remaining until target */
  blocksLeft: bigint;
  /** Current timer state (see `getGracePeriodStatus`) */
  status: GracePeriodStatus;
  /** Initial total time in ms (for progress calculation) */
  initialTotalMs?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Displays a grace period countdown with time, blocks, and progress bar.
 */
export function GracePeriodTimer({
  timeRemaining,
  totalMs,
  blocksLeft,
  status,
  initialTotalMs,
  className,
}: GracePeriodTimerProps) {
  // Loading state
  if (status === 'loading') {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className="h-12 w-48 mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  // Calculate progress percentage
  const progressValue =
    initialTotalMs && initialTotalMs > 0
      ? Math.max(0, Math.min(100, ((initialTotalMs - totalMs) / initialTotalMs) * 100))
      : 0;

  // Determine urgency level
  const isUrgent = status !== 'expired' && totalMs > 0 && totalMs < 60_000; // Less than 1 minute

  // Format the time display
  const timeDisplay = formatTimeString(totalMs, {
    showDays: timeRemaining.days > 0,
    showHours: timeRemaining.hours > 0 || timeRemaining.days > 0,
    padHours: true,
  });

  // Waiting for block confirmation state
  if (status === 'waiting-for-block') {
    return (
      <div className={cn('space-y-3 text-center', className)}>
        <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400 animate-pulse motion-reduce:animate-none">
          Waiting for Block...
        </div>
        <p className="text-sm text-muted-foreground">
          Timer estimate reached zero. Waiting for blockchain confirmation...
        </p>
        <p className="text-xs text-muted-foreground">
          ~{blocksLeft.toString()} block{blocksLeft !== 1n ? 's' : ''} remaining
        </p>
        <Progress value={95} className="h-2 [&>[data-slot=progress-indicator]]:bg-amber-500" />
      </div>
    );
  }

  // Expired state
  if (status === 'expired') {
    return (
      <div className={cn('space-y-3 text-center', className)}>
        <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
          Ready to Continue
        </div>
        <p className="text-sm text-muted-foreground">
          Grace period complete. You can now proceed with registration.
        </p>
        <Progress value={100} className="h-2" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 text-center', className)}>
      {/* Time display */}
      <div className="flex items-center justify-center gap-2">
        <div
          className={cn(
            'font-mono text-4xl font-bold tabular-nums tracking-tight',
            isUrgent && 'text-amber-600 dark:text-amber-400 animate-pulse',
            !isUrgent && 'text-foreground'
          )}
        >
          {timeDisplay}
        </div>
      </div>

      {/* Blocks remaining */}
      <div className="flex items-center justify-center gap-1">
        <p className="text-sm text-muted-foreground">
          ~{blocksLeft.toString()} block{blocksLeft !== 1n ? 's' : ''} remaining
        </p>
        <InfoTooltip
          content="The grace period is measured in blockchain blocks, not wall-clock time. The time shown above is an estimate based on average block times. Actual completion depends on when the target block is confirmed on-chain."
          size="sm"
        />
      </div>

      {/* Progress bar */}
      <Progress
        value={progressValue}
        className={cn('h-2', isUrgent && '[&>[data-slot=progress-indicator]]:bg-amber-500')}
      />

      {/* Status indicator */}
      {status === 'running' && (
        <p className="text-xs text-muted-foreground">
          {isUrgent ? 'Almost ready!' : 'Please wait during the grace period...'}
        </p>
      )}
    </div>
  );
}

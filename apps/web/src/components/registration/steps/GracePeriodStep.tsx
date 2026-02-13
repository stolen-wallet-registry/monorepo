/**
 * Grace period step content.
 *
 * Displays countdown timer until the registration window opens.
 * This is a content-only component - wrap in Card if needed for standalone use.
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useChainId } from 'wagmi';

import { Alert, AlertDescription, Skeleton } from '@swr/ui';
import { GracePeriodTimer } from '@/components/composed/GracePeriodTimer';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { getExplorerTxUrl } from '@/lib/explorer';
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { useCountdownTimer } from '@/hooks/useCountdownTimer';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/useTheme';
import { AlertCircle, Check } from 'lucide-react';

export interface GracePeriodStepProps {
  /** Called when step is complete */
  onComplete: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Grace period step content - shows countdown until registration can proceed.
 * Content-only component - parent provides Card wrapper.
 */
export function GracePeriodStep({ onComplete, className }: GracePeriodStepProps) {
  const chainId = useChainId();
  const { registeree } = useFormStore();
  const { acknowledgementHash } = useRegistrationStore();
  const { themeVariant, triggerThemeAnimation, setThemeVariant, setColorScheme } = useTheme();

  // Use refs for theme values to avoid stale closure issues in handleExpire callback.
  // useLayoutEffect runs synchronously after render but before paint, ensuring refs
  // are updated before any callbacks can fire.
  const themeVariantRef = useRef(themeVariant);
  const triggerThemeAnimationRef = useRef(triggerThemeAnimation);

  useLayoutEffect(() => {
    themeVariantRef.current = themeVariant;
    triggerThemeAnimationRef.current = triggerThemeAnimation;
  }, [themeVariant, triggerThemeAnimation]);

  // Get explorer URL for acknowledgement tx
  const ackExplorerUrl = acknowledgementHash
    ? getExplorerTxUrl(chainId, acknowledgementHash)
    : null;

  // Track logging state
  const hasLoggedStart = useRef(false);
  const hasLoggedNoPendingAck = useRef(false);
  // Store initial totalMs for progress bar calculation (captured once from first valid totalMs)
  const [initialTotalMs, setInitialTotalMs] = useState<number | undefined>(undefined);

  // Normalize registeree before passing to hook to avoid invalid queries
  // Convert null to undefined for the hook (formStore uses null, hook expects undefined)
  const normalizedRegisteree = registeree ?? undefined;

  // Fetch deadlines from contract
  const {
    data: deadlines,
    isLoading: deadlinesLoading,
    isError: deadlinesError,
  } = useContractDeadlines(normalizedRegisteree);

  // Detect zeroed deadline data — indicates no pending acknowledgement in the contract
  const hasNoPendingAck =
    deadlines !== undefined && deadlines.start === 0n && deadlines.expiry === 0n;

  useEffect(() => {
    if (hasNoPendingAck && !hasLoggedNoPendingAck.current) {
      hasLoggedNoPendingAck.current = true;
      logger.registration.warn('GracePeriodStep: No pending acknowledgement detected', {
        registeree,
        start: deadlines?.start.toString(),
        expiry: deadlines?.expiry.toString(),
      });
    }
  }, [hasNoPendingAck, registeree, deadlines]);

  // Log when deadlines are loaded (skip when no pending ack — zeroed data would produce bogus values)
  useEffect(() => {
    if (deadlines && !hasNoPendingAck && !hasLoggedStart.current) {
      hasLoggedStart.current = true;
      logger.registration.info('Grace period started', {
        registeree,
        currentBlock: deadlines.currentBlock.toString(),
        windowOpensAtBlock: deadlines.start.toString(),
        windowClosesAtBlock: deadlines.expiry.toString(),
        blocksUntilOpen: (deadlines.start - deadlines.currentBlock).toString(),
        chainId,
      });
    }
  }, [deadlines, hasNoPendingAck, registeree, chainId]);

  // Custom onExpire handler with theme switch.
  // Uses refs to access latest theme values, avoiding stale closure issues.
  const handleExpire = useCallback(() => {
    const currentThemeVariant = themeVariantRef.current;
    const currentTriggerFn = triggerThemeAnimationRef.current;

    // Switch to hacker dark theme when grace period expires.
    // Both variant and colorScheme are applied in the same View Transition animation.
    if (currentThemeVariant !== 'hacker') {
      if (currentTriggerFn) {
        logger.registration.info('Triggering hacker dark theme animation');
        currentTriggerFn('hacker', 'dark');
      } else {
        logger.registration.warn('triggerThemeAnimation not available, using fallback');
        setThemeVariant('hacker');
        setColorScheme('dark');
      }
    }

    logger.registration.info('Grace period complete');
    onComplete();
  }, [setThemeVariant, setColorScheme, onComplete]);

  // Countdown timer - target is the START block (when window opens)
  // Note: The hook is intentionally called even when deadlines is null/loading.
  // The hook is designed to handle null values gracefully (returns 0 time remaining),
  // and this pattern follows React's rules of hooks (always call hooks in the same order).
  // The early return for loading state above prevents invalid UI while data loads.
  // Pass null when no pending ack to prevent timer from firing immediately on zeroed data
  const timerTargetBlock = hasNoPendingAck ? null : (deadlines?.start ?? null);
  const timerCurrentBlock = hasNoPendingAck ? null : (deadlines?.currentBlock ?? null);

  const { timeRemaining, totalMs, blocksLeft, isExpired, isRunning, isWaitingForBlock } =
    useCountdownTimer({
      targetBlock: timerTargetBlock,
      currentBlock: timerCurrentBlock,
      chainId,
      onExpire: handleExpire,
      autoStart: true,
    });

  // Capture initial total time for progress calculation and log once
  // This setState is intentional and guarded - only runs once when initialTotalMs is first captured
  useEffect(() => {
    if (totalMs > 0) {
      // Capture initial value for progress bar (runs only once)
      if (initialTotalMs === undefined) {
        setInitialTotalMs(totalMs);
      }
      // Log once
      if (!hasLoggedStart.current) {
        hasLoggedStart.current = true;
        logger.registration.debug('Grace period timer initialized', {
          totalMs,
          blocksLeft: blocksLeft.toString(),
        });
      }
    }
  }, [totalMs, blocksLeft, initialTotalMs]);

  // Missing registeree
  if (!registeree) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Missing registration data. Please start over from the beginning.
        </AlertDescription>
      </Alert>
    );
  }

  // Loading state
  if (deadlinesLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <p className="text-sm text-muted-foreground">Loading deadline information...</p>
        <div className="space-y-3">
          <Skeleton className="h-12 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-2 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (deadlinesError || !deadlines) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load deadline information. Please refresh the page and try again.
        </AlertDescription>
      </Alert>
    );
  }

  // No pending acknowledgement — contract returned zeroed deadline data
  if (hasNoPendingAck) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No pending acknowledgement found. The registration window may have expired. Please go back
          and submit the acknowledgement again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Acknowledgement success summary */}
      {acknowledgementHash && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-full bg-green-500">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-green-800 dark:text-green-200 text-sm">
                Acknowledgement Confirmed
              </p>
              <div className="mt-1 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                <span className="shrink-0">Tx:</span>
                <ExplorerLink value={acknowledgementHash} href={ackExplorerUrl} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status description */}
      <p className="text-sm text-muted-foreground text-center">
        {isExpired
          ? 'The grace period has ended. You can now complete your registration.'
          : 'Please wait while the grace period completes. This protects against phishing attacks.'}
      </p>

      {/* Timer */}
      <GracePeriodTimer
        timeRemaining={timeRemaining}
        totalMs={totalMs}
        blocksLeft={blocksLeft}
        isExpired={isExpired}
        isRunning={isRunning}
        isWaitingForBlock={isWaitingForBlock}
        initialTotalMs={initialTotalMs}
      />

      {/* Additional info */}
      <div
        className="mt-6 space-y-2 text-sm text-muted-foreground"
        role="region"
        aria-label="Registration deadline information"
      >
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1" id="current-block-label">
            Current Block:
            <InfoTooltip
              content="The latest confirmed block number on the blockchain. The grace period countdown is based on block numbers, not wall-clock time."
              size="sm"
            />
          </span>
          <span className="font-mono" aria-labelledby="current-block-label">
            {deadlines.currentBlock.toString()}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1" id="window-opens-label">
            Window Opens:
            <InfoTooltip
              content="The block number when you can start the registration step. You must wait until this block is reached before proceeding."
              size="sm"
            />
          </span>
          <span className="font-mono" aria-labelledby="window-opens-label">
            {deadlines.start.toString()}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1" id="window-closes-label">
            Window Closes:
            <InfoTooltip
              content="The block number when your registration window expires. You must complete registration before this block or you'll need to start over."
              size="sm"
            />
          </span>
          <span className="font-mono" aria-labelledby="window-closes-label">
            {deadlines.expiry.toString()}
          </span>
        </div>
      </div>
    </div>
  );
}

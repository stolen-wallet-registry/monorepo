/**
 * Transaction batch grace period step.
 *
 * Displays countdown timer until the registration window opens.
 */

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useChainId } from 'wagmi';

import { Alert, AlertDescription, Skeleton } from '@swr/ui';
import { GracePeriodTimer } from '@/components/composed/GracePeriodTimer';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { getExplorerTxUrl } from '@/lib/explorer';
import { useTxContractDeadlines } from '@/hooks/transactions';
import { useCountdownTimer } from '@/hooks/useCountdownTimer';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/useTheme';
import { AlertCircle, Check } from 'lucide-react';

export interface TxGracePeriodStepProps {
  /** Called when step is complete */
  onComplete: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Transaction batch grace period step - shows countdown until registration can proceed.
 */
export function TxGracePeriodStep({ onComplete, className }: TxGracePeriodStepProps) {
  const chainId = useChainId();
  const { sortedTxHashes } = useTransactionSelection();
  // Use reporter from form store - this is the address deadlines are stored under in the contract
  // In self-relay, the connected wallet may be the gas wallet (forwarder), not the reporter
  const reporter = useTransactionFormStore((s) => s.reporter);
  const { acknowledgementHash } = useTransactionRegistrationStore();
  const { themeVariant, triggerThemeAnimation, setThemeVariant } = useTheme();

  // Use refs for theme values to avoid stale closure issues in handleExpire callback
  const themeVariantRef = useRef(themeVariant);
  const triggerThemeAnimationRef = useRef(triggerThemeAnimation);

  // useLayoutEffect ensures refs are updated synchronously before callbacks fire
  useLayoutEffect(() => {
    themeVariantRef.current = themeVariant;
    triggerThemeAnimationRef.current = triggerThemeAnimation;
  }, [themeVariant, triggerThemeAnimation]);

  // Get explorer URL for acknowledgement tx
  const ackExplorerUrl = acknowledgementHash
    ? getExplorerTxUrl(chainId, acknowledgementHash)
    : null;

  // Track logging state
  const hasLoggedStartForDeadlines = useRef(false);
  const hasLoggedStartForTimer = useRef(false);
  // Store initial totalMs for progress bar calculation
  // This state is intentionally set in an effect when the external timer first provides a value
  const [initialTotalMs, setInitialTotalMs] = useState<number | undefined>(undefined);

  // Fetch deadlines from contract using reporter address (not connected wallet)
  // In self-relay, the connected wallet may be the gas wallet, but deadlines are stored under reporter
  const {
    data: deadlines,
    isLoading: deadlinesLoading,
    isError: deadlinesError,
  } = useTxContractDeadlines(reporter ?? undefined);

  // Log when deadlines are loaded
  useEffect(() => {
    if (deadlines && !hasLoggedStartForDeadlines.current) {
      hasLoggedStartForDeadlines.current = true;
      logger.registration.info('Transaction batch grace period started', {
        transactionCount: sortedTxHashes.length,
        currentBlock: deadlines.currentBlock.toString(),
        windowOpensAtBlock: deadlines.start.toString(),
        windowClosesAtBlock: deadlines.expiry.toString(),
        blocksUntilOpen: (deadlines.start - deadlines.currentBlock).toString(),
        chainId,
      });
    }
  }, [deadlines, sortedTxHashes.length, chainId]);

  // Custom onExpire handler with theme switch
  const handleExpire = useCallback(() => {
    const currentThemeVariant = themeVariantRef.current;
    const currentTriggerFn = triggerThemeAnimationRef.current;

    // Switch to hacker theme when grace period expires
    if (currentThemeVariant !== 'hacker') {
      if (currentTriggerFn) {
        logger.registration.info('Triggering hacker theme animation');
        currentTriggerFn('hacker');
      } else {
        logger.registration.warn('triggerThemeAnimation not available, using fallback');
        setThemeVariant('hacker');
      }
    }

    logger.registration.info('Transaction batch grace period complete');
    onComplete();
  }, [setThemeVariant, onComplete]);

  // Countdown timer - target is the START block (when window opens)
  const { timeRemaining, totalMs, blocksLeft, isExpired, isRunning, isWaitingForBlock } =
    useCountdownTimer({
      targetBlock: deadlines?.start ?? null,
      currentBlock: deadlines?.currentBlock ?? null,
      chainId,
      onExpire: handleExpire,
      autoStart: true,
    });

  // Capture initial total time for progress calculation
  // This effect intentionally sets state when the external timer first provides a valid value
  useEffect(() => {
    if (totalMs > 0) {
      if (initialTotalMs === undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: capturing initial value from external timer
        setInitialTotalMs(totalMs);
      }
      if (!hasLoggedStartForTimer.current) {
        hasLoggedStartForTimer.current = true;
        logger.registration.debug('Transaction batch grace period timer initialized', {
          totalMs,
          blocksLeft: blocksLeft.toString(),
        });
      }
    }
  }, [totalMs, blocksLeft, initialTotalMs]);

  // Missing transaction data or reporter
  if (sortedTxHashes.length === 0 || !reporter) {
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

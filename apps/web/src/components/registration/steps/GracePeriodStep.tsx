/**
 * Grace period step.
 *
 * Displays countdown timer until the registration window opens.
 */

import { useEffect, useRef } from 'react';
import { useChainId } from 'wagmi';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GracePeriodTimer } from '@/components/composed/GracePeriodTimer';
import { useFormStore } from '@/stores/formStore';
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { useCountdownTimer } from '@/hooks/useCountdownTimer';
import { logger } from '@/lib/logger';
import { AlertCircle, Clock } from 'lucide-react';

export interface GracePeriodStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Grace period step - shows countdown until registration can proceed.
 */
export function GracePeriodStep({ onComplete }: GracePeriodStepProps) {
  const chainId = useChainId();
  const { registeree } = useFormStore();

  // Track initial total time for progress calculation
  const initialTotalMsRef = useRef<number | null>(null);
  const hasLoggedStart = useRef(false);

  // Fetch deadlines from contract
  const {
    data: deadlines,
    isLoading: deadlinesLoading,
    isError: deadlinesError,
  } = useContractDeadlines(registeree ?? undefined);

  // Log when deadlines are loaded
  useEffect(() => {
    if (deadlines && !hasLoggedStart.current) {
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
  }, [deadlines, registeree, chainId]);

  // Custom onExpire handler with logging
  const handleExpire = () => {
    logger.registration.info('Grace period complete, registration window is now open', {
      registeree,
    });
    onComplete();
  };

  // Countdown timer - target is the START block (when window opens)
  const { timeRemaining, totalMs, blocksLeft, isExpired, isRunning, isWaitingForBlock } =
    useCountdownTimer({
      targetBlock: deadlines?.start ?? null,
      currentBlock: deadlines?.currentBlock ?? null,
      chainId,
      onExpire: handleExpire,
      autoStart: true,
    });

  // Store initial total time on first render with data
  useEffect(() => {
    if (totalMs > 0 && initialTotalMsRef.current === null) {
      initialTotalMsRef.current = totalMs;
      logger.registration.debug('Grace period timer initialized', {
        totalMs,
        blocksLeft: blocksLeft.toString(),
      });
    }
  }, [totalMs, blocksLeft]);

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
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-muted">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Grace Period</CardTitle>
              <CardDescription>Loading deadline information...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <GracePeriodTimer
            timeRemaining={{ days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 }}
            totalMs={0}
            blocksLeft={0n}
            isExpired={false}
            isRunning={false}
            isLoading={true}
          />
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-muted">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Grace Period</CardTitle>
            <CardDescription>
              {isExpired
                ? 'The grace period has ended. You can now complete your registration.'
                : 'Please wait while the grace period completes. This protects against phishing attacks.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <GracePeriodTimer
          timeRemaining={timeRemaining}
          totalMs={totalMs}
          blocksLeft={blocksLeft}
          isExpired={isExpired}
          isRunning={isRunning}
          isWaitingForBlock={isWaitingForBlock}
          initialTotalMs={initialTotalMsRef.current ?? undefined}
        />

        {/* Additional info */}
        <div
          className="mt-6 space-y-2 text-sm text-muted-foreground"
          role="region"
          aria-label="Registration deadline information"
        >
          <div className="flex justify-between">
            <span id="current-block-label">Current Block:</span>
            <span className="font-mono" aria-labelledby="current-block-label">
              {deadlines.currentBlock.toString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span id="window-opens-label">Window Opens:</span>
            <span className="font-mono" aria-labelledby="window-opens-label">
              {deadlines.start.toString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span id="window-closes-label">Window Closes:</span>
            <span className="font-mono" aria-labelledby="window-closes-label">
              {deadlines.expiry.toString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

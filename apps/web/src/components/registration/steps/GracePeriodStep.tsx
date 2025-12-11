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

  // Fetch deadlines from contract
  const {
    data: deadlines,
    isLoading: deadlinesLoading,
    isError: deadlinesError,
  } = useContractDeadlines(registeree ?? undefined);

  // Countdown timer - target is the START block (when window opens)
  const { timeRemaining, totalMs, blocksLeft, isExpired, isRunning } = useCountdownTimer({
    targetBlock: deadlines?.start ?? null,
    currentBlock: deadlines?.currentBlock ?? null,
    chainId,
    onExpire: onComplete,
    autoStart: true,
  });

  // Store initial total time on first render with data
  useEffect(() => {
    if (totalMs > 0 && initialTotalMsRef.current === null) {
      initialTotalMsRef.current = totalMs;
    }
  }, [totalMs]);

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
          initialTotalMs={initialTotalMsRef.current ?? undefined}
        />

        {/* Additional info */}
        <div className="mt-6 space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Current Block:</span>
            <span className="font-mono">{deadlines.currentBlock.toString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Window Opens:</span>
            <span className="font-mono">{deadlines.start.toString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Window Closes:</span>
            <span className="font-mono">{deadlines.expiry.toString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

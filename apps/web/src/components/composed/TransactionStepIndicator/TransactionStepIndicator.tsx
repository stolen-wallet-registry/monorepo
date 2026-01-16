/**
 * Step indicator component for transaction registration flow progress.
 *
 * Shows vertical list of steps with current/completed/pending states.
 */

import { Check, Circle, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type {
  TransactionRegistrationStep,
  TransactionRegistrationType,
} from '@/stores/transactionRegistrationStore';
import { TX_STEP_SEQUENCES } from '@/stores/transactionRegistrationStore';

export type StepStatus = 'pending' | 'current' | 'completed';

export interface TransactionStepIndicatorProps {
  /** Registration type determines step sequence */
  registrationType: TransactionRegistrationType;
  /** Current step in the flow */
  currentStep: TransactionRegistrationStep | null;
  /** Custom step labels (optional, defaults provided) */
  stepLabels?: Partial<Record<TransactionRegistrationStep, string>>;
  /** Custom step descriptions (optional) */
  stepDescriptions?: Partial<Record<TransactionRegistrationStep, string>>;
  /** Additional class names */
  className?: string;
}

/**
 * Default labels for each step.
 */
const DEFAULT_STEP_LABELS: Record<TransactionRegistrationStep, string> = {
  'select-transactions': 'Select Transactions',
  'acknowledge-sign': 'Sign Acknowledgement',
  'acknowledge-pay': 'Submit Acknowledgement',
  'switch-and-pay-ack': 'Switch Wallet & Submit',
  'wait-for-connection': 'Connect to Helper',
  'acknowledgement-payment': 'Wait for Submission',
  'grace-period': 'Wait for Grace Period',
  'register-sign': 'Sign Registration',
  'register-pay': 'Submit Registration',
  'switch-and-pay-reg': 'Switch Wallet & Submit',
  'registration-payment': 'Wait for Registration',
  success: 'Complete',
};

/**
 * Get the status of a step relative to the current step.
 */
function getStepStatus(
  step: TransactionRegistrationStep,
  currentStep: TransactionRegistrationStep | null,
  sequence: TransactionRegistrationStep[]
): StepStatus {
  if (!currentStep) return 'pending';

  const stepIndex = sequence.indexOf(step);
  const currentIndex = sequence.indexOf(currentStep);

  // Guard against invalid/unknown steps (-1 from indexOf)
  if (currentIndex === -1) {
    if (step === sequence[0]) {
      logger.ui.warn('Unknown currentStep in sequence', {
        component: 'TransactionStepIndicator',
        currentStep,
        availableSteps: sequence,
      });
    }
    return 'pending';
  }
  if (stepIndex === -1) {
    return 'pending';
  }

  // Success step should show as completed when we're on it (not spinner)
  if (step === 'success' && currentStep === 'success') {
    return 'completed';
  }

  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'current';
  return 'pending';
}

/**
 * Displays transaction registration flow progress as a vertical step list.
 */
export function TransactionStepIndicator({
  registrationType,
  currentStep,
  stepLabels = {},
  stepDescriptions = {},
  className,
}: TransactionStepIndicatorProps) {
  const sequence = TX_STEP_SEQUENCES[registrationType];

  return (
    <nav aria-label="Registration progress" className={cn('space-y-4', className)}>
      <ol className="relative space-y-4">
        {sequence.map((step, index) => {
          const status = getStepStatus(step, currentStep, sequence);
          const label = stepLabels[step] ?? DEFAULT_STEP_LABELS[step];
          const description = stepDescriptions[step];
          const isLast = index === sequence.length - 1;

          return (
            <li key={step} className="relative">
              <div className="flex items-start gap-3">
                {/* Step icon */}
                <div
                  className={cn(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    status === 'completed' && 'border-green-500 bg-green-500 text-white',
                    status === 'current' && 'border-primary bg-primary text-primary-foreground',
                    status === 'pending' &&
                      'border-muted-foreground/30 bg-background text-muted-foreground'
                  )}
                >
                  {status === 'completed' ? (
                    <Check className="h-4 w-4" />
                  ) : status === 'current' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>

                {/* Step content */}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={cn(
                      'text-sm font-medium transition-colors',
                      status === 'completed' && 'text-green-600 dark:text-green-400',
                      status === 'current' && 'text-foreground',
                      status === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </p>
                  {description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute left-[15px] top-8 h-full w-0.5 -translate-x-1/2',
                    status === 'completed' ? 'bg-green-500' : 'bg-muted-foreground/30'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

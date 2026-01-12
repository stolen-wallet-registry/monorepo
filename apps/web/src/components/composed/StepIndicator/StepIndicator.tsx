/**
 * Step indicator component for registration flow progress.
 *
 * Shows vertical list of steps with current/completed/pending states.
 */

import { Check, Circle, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { RegistrationStep, RegistrationType } from '@/stores/registrationStore';
import { STEP_SEQUENCES } from '@/stores/registrationStore';

export interface StepConfig {
  id: RegistrationStep;
  label: string;
  description?: string;
}

export type StepStatus = 'pending' | 'current' | 'completed';

export interface StepIndicatorProps {
  /** Registration type determines step sequence */
  registrationType: RegistrationType;
  /** Current step in the flow */
  currentStep: RegistrationStep | null;
  /** Custom step labels (optional, defaults provided) */
  stepLabels?: Partial<Record<RegistrationStep, string>>;
  /** Custom step descriptions (optional) */
  stepDescriptions?: Partial<Record<RegistrationStep, string>>;
  /** Additional class names */
  className?: string;
}

/**
 * Default labels for each step.
 */
const DEFAULT_STEP_LABELS: Record<RegistrationStep, string> = {
  'acknowledge-and-sign': 'Sign Acknowledgement',
  'acknowledge-and-pay': 'Submit Acknowledgement',
  'switch-and-pay-one': 'Switch Wallet & Submit',
  'wait-for-connection': 'Connect to Helper',
  'acknowledgement-payment': 'Wait for Submission',
  'grace-period': 'Wait for Grace Period',
  'register-and-sign': 'Sign Registration',
  'register-and-pay': 'Submit Registration',
  'switch-and-pay-two': 'Switch Wallet & Submit',
  'registration-payment': 'Wait for Registration',
  success: 'Complete',
};

/**
 * Get the status of a step relative to the current step.
 */
function getStepStatus(
  step: RegistrationStep,
  currentStep: RegistrationStep | null,
  sequence: RegistrationStep[]
): StepStatus {
  if (!currentStep) return 'pending';

  const stepIndex = sequence.indexOf(step);
  const currentIndex = sequence.indexOf(currentStep);

  // Guard against invalid/unknown steps (-1 from indexOf)
  if (currentIndex === -1) {
    logger.ui.warn('Unknown currentStep in sequence', {
      component: 'StepIndicator',
      currentStep,
      availableSteps: sequence,
    });
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
 * Displays registration flow progress as a vertical step list.
 */
export function StepIndicator({
  registrationType,
  currentStep,
  stepLabels = {},
  stepDescriptions = {},
  className,
}: StepIndicatorProps) {
  const sequence = STEP_SEQUENCES[registrationType];

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

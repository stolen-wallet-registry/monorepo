/**
 * Step navigation hook for registration flows.
 *
 * Provides step progression and reset functionality.
 */

import { useCallback } from 'react';
import {
  useRegistrationStore,
  getNextStep,
  getPreviousStep,
  type RegistrationStep,
} from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { clearAllSignatures } from '@/lib/signatures';
import { logger } from '@/lib/logger';

export interface UseStepNavigationResult {
  /** Current step */
  currentStep: RegistrationStep | null;
  /** Go to the next step in the sequence */
  goToNextStep: () => void;
  /** Go to the previous step in the sequence */
  goToPreviousStep: () => void;
  /** Go to a specific step */
  goToStep: (step: RegistrationStep) => void;
  /** Reset the entire registration flow */
  resetFlow: () => void;
  /** Check if current step is the first step */
  isFirstStep: boolean;
  /** Check if current step is the last step (success) */
  isLastStep: boolean;
}

/**
 * Hook for navigating between registration steps.
 *
 * @returns Step navigation controls and state
 */
export function useStepNavigation(): UseStepNavigationResult {
  const { registrationType, step, setStep, reset: resetRegistration } = useRegistrationStore();
  const { reset: resetForm } = useFormStore();

  /**
   * Go to the next step in the sequence.
   */
  const goToNextStep = useCallback(() => {
    if (!step) {
      logger.registration.warn('Cannot advance - no current step');
      return;
    }

    const nextStep = getNextStep(registrationType, step);
    if (nextStep) {
      logger.registration.info('Advancing to next step', { from: step, to: nextStep });
      setStep(nextStep);
    } else {
      logger.registration.warn('No next step available', { currentStep: step });
    }
  }, [registrationType, step, setStep]);

  /**
   * Go to the previous step in the sequence.
   */
  const goToPreviousStep = useCallback(() => {
    if (!step) {
      logger.registration.warn('Cannot go back - no current step');
      return;
    }

    const prevStep = getPreviousStep(registrationType, step);
    if (prevStep) {
      logger.registration.info('Going back to previous step', { from: step, to: prevStep });
      setStep(prevStep);
    } else {
      logger.registration.warn('No previous step available', { currentStep: step });
    }
  }, [registrationType, step, setStep]);

  /**
   * Go to a specific step.
   */
  const goToStep = useCallback(
    (targetStep: RegistrationStep) => {
      logger.registration.info('Going to specific step', { from: step, to: targetStep });
      setStep(targetStep);
    },
    [step, setStep]
  );

  /**
   * Reset the entire registration flow.
   * Clears all stores and signatures.
   */
  const resetFlow = useCallback(() => {
    logger.registration.info('Resetting entire registration flow');
    resetRegistration();
    resetForm();
    clearAllSignatures();
  }, [resetRegistration, resetForm]);

  // Check if current step is first/last
  const isFirstStep = step ? !getPreviousStep(registrationType, step) : true;
  const isLastStep = step === 'success';

  return {
    currentStep: step,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    resetFlow,
    isFirstStep,
    isLastStep,
  };
}

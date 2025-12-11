/**
 * Step renderer component.
 *
 * Maps the current registration step to the appropriate component.
 */

import type { ReactNode } from 'react';

import {
  InitialFormStep,
  AcknowledgementPayStep,
  GracePeriodStep,
  RegistrationSignStep,
  RegistrationPayStep,
  SuccessStep,
} from './steps';
import type { RegistrationStep } from '@/stores/registrationStore';

export interface StepRendererProps {
  /** Current step in the flow */
  currentStep: RegistrationStep | null;
  /** Callback to advance to next step */
  onStepComplete: () => void;
}

/**
 * Renders the appropriate component for the current registration step.
 */
export function StepRenderer({ currentStep, onStepComplete }: StepRendererProps) {
  // No step selected yet
  if (!currentStep) {
    return (
      <div className="text-muted-foreground text-center py-12">
        Initializing registration flow...
      </div>
    );
  }

  // Map steps to components
  // Note: Some steps (switch-and-pay-one, switch-and-pay-two) use the same
  // component as their standard counterparts since WalletSwitchPrompt
  // is shown based on registrationType inside the component
  const stepComponents: Record<RegistrationStep, ReactNode> = {
    // Initial step - form and ACK signing
    'acknowledge-and-sign': <InitialFormStep onComplete={onStepComplete} />,

    // Standard: submit ACK tx
    'acknowledge-and-pay': <AcknowledgementPayStep onComplete={onStepComplete} />,

    // Self-relay: switch wallet and submit ACK tx
    'switch-and-pay-one': <AcknowledgementPayStep onComplete={onStepComplete} />,

    // P2P: wait for connection
    'wait-for-connection': (
      <div className="text-muted-foreground text-center py-12">
        P2P connection step - Coming in Phase 1C
      </div>
    ),

    // P2P: wait for acknowledgement payment from relayer
    'acknowledgement-payment': (
      <div className="text-muted-foreground text-center py-12">
        P2P acknowledgement payment step - Coming in Phase 1C
      </div>
    ),

    // Grace period countdown
    'grace-period': <GracePeriodStep onComplete={onStepComplete} />,

    // Sign registration
    'register-and-sign': <RegistrationSignStep onComplete={onStepComplete} />,

    // Standard: submit REG tx
    'register-and-pay': <RegistrationPayStep onComplete={onStepComplete} />,

    // Self-relay: switch wallet and submit REG tx
    'switch-and-pay-two': <RegistrationPayStep onComplete={onStepComplete} />,

    // P2P: wait for registration payment from relayer
    'registration-payment': (
      <div className="text-muted-foreground text-center py-12">
        P2P registration payment step - Coming in Phase 1C
      </div>
    ),

    // Success
    success: <SuccessStep />,
  };

  const component = stepComponents[currentStep];

  if (!component) {
    return <div className="text-destructive text-center py-12">Unknown step: {currentStep}</div>;
  }

  return <>{component}</>;
}

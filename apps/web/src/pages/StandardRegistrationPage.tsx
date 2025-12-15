/**
 * Standard registration flow page.
 *
 * User signs and pays from the same wallet.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepIndicator } from '@/components/composed/StepIndicator';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { StepRenderer } from '@/components/registration';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';

/**
 * Step descriptions for standard flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<RegistrationStep, string>> = {
  'acknowledge-and-sign': 'Sign the EIP-712 acknowledgement message',
  'acknowledge-and-pay': 'Submit the acknowledgement transaction',
  'grace-period': 'Wait for the grace period to complete',
  'register-and-sign': 'Sign the EIP-712 registration message',
  'register-and-pay': 'Submit the registration transaction',
  success: 'Registration successful',
};

/**
 * Step titles for standard flow.
 */
const STEP_TITLES: Partial<Record<RegistrationStep, string>> = {
  'acknowledge-and-sign': 'Sign Acknowledgement',
  'acknowledge-and-pay': 'Submit Acknowledgement',
  'grace-period': 'Grace Period',
  'register-and-sign': 'Sign Registration',
  'register-and-pay': 'Submit Registration',
  success: 'Complete',
};

/**
 * Tooltip content for each step explaining what it does.
 */
const STEP_TOOLTIPS: Partial<Record<RegistrationStep, string>> = {
  'acknowledge-and-sign':
    'First step: Sign an EIP-712 message acknowledging your intent to register this wallet as stolen. This creates a cryptographic proof that you control the wallet.',
  'acknowledge-and-pay':
    'Submit the acknowledgement transaction to the blockchain. This starts a mandatory grace period before final registration.',
  'grace-period':
    'A randomized waiting period (1-4 minutes) designed to prevent phishing attacks. This delay ensures you have time to recognize and cancel suspicious registrations.',
  'register-and-sign':
    'Second signature: Sign the final registration message. This confirms your intent to register the wallet as stolen after the grace period.',
  'register-and-pay':
    'Submit the registration transaction to permanently mark this wallet as stolen on the blockchain.',
  success: 'Your wallet has been successfully registered as stolen in the on-chain registry.',
};

export function StandardRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected } = useAccount();
  const { registrationType, step, setRegistrationType } = useRegistrationStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Initialize registration type
  useEffect(() => {
    if (registrationType !== 'standard') {
      setRegistrationType('standard');
    }
  }, [registrationType, setRegistrationType]);

  // Redirect if not connected (side effect in useEffect, not during render)
  useEffect(() => {
    if (!isConnected) {
      setLocation('/');
    }
  }, [isConnected, setLocation]);

  if (!isConnected) {
    return null;
  }

  const handleBack = () => {
    resetFlow();
    setLocation('/');
  };

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps in the sidebar to complete your registration.';
  const currentTooltip = step ? STEP_TOOLTIPS[step] : undefined;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <Button type="button" variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-stretch">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Standard Registration</CardTitle>
                <InfoTooltip
                  content="Register your stolen wallet using your own funds. You'll sign and pay from the same wallet being registered."
                  side="right"
                />
              </div>
              <CardDescription>Sign and pay from the same wallet</CardDescription>
            </CardHeader>
            <CardContent>
              <StepIndicator
                registrationType="standard"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content - min-height matches sidebar via items-stretch */}
        <main>
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{currentTitle}</CardTitle>
                {currentTooltip && <InfoTooltip content={currentTooltip} side="right" />}
              </div>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-center">
              <StepRenderer currentStep={step} onStepComplete={goToNextStep} />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

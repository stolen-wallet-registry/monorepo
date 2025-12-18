/**
 * Self-relay registration flow page.
 *
 * User signs with stolen wallet, then switches to a different wallet to pay gas.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft } from 'lucide-react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';
import { StepIndicator } from '@/components/composed/StepIndicator';
import { ErrorBoundary } from '@/components/composed/ErrorBoundary';
import { StepRenderer } from '@/components/registration';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';

/**
 * Step descriptions for self-relay flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<RegistrationStep, string>> = {
  'acknowledge-and-sign': 'Sign the EIP-712 acknowledgement with your stolen wallet',
  'switch-and-pay-one': 'Switch to your gas wallet and submit acknowledgement',
  'grace-period': 'Wait for the grace period to complete',
  'register-and-sign': 'Switch back and sign with your stolen wallet',
  'switch-and-pay-two': 'Switch to your gas wallet and submit registration',
  success: 'Registration successful',
};

/**
 * Step titles for self-relay flow.
 */
const STEP_TITLES: Partial<Record<RegistrationStep, string>> = {
  'acknowledge-and-sign': 'Sign Acknowledgement',
  'switch-and-pay-one': 'Switch Wallet & Submit',
  'grace-period': 'Grace Period',
  'register-and-sign': 'Sign Registration',
  'switch-and-pay-two': 'Switch Wallet & Submit',
  success: 'Complete',
};

export function SelfRelayRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected } = useAccount();
  const { registrationType, step, setRegistrationType } = useRegistrationStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Initialize registration type on mount
  useEffect(() => {
    if (registrationType !== 'selfRelay') {
      setRegistrationType('selfRelay');
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

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <Button variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Self-Relay Registration</CardTitle>
              <CardDescription>Sign with stolen wallet, pay with another</CardDescription>
            </CardHeader>
            <CardContent>
              <StepIndicator
                registrationType="selfRelay"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content - min height matches sidebar, grows with content */}
        <main className="self-stretch">
          <Card className="flex flex-col h-full">
            <CardHeader>
              <CardTitle>{currentTitle}</CardTitle>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-center">
              <ErrorBoundary>
                <StepRenderer currentStep={step} onStepComplete={goToNextStep} />
              </ErrorBoundary>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

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
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';

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

export function StandardRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected } = useAccount();
  const { step, reset } = useRegistrationStore();

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
    reset();
    setLocation('/');
  };

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps in the sidebar to complete your registration.';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <Button variant="ghost" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
        {/* Step Indicator Sidebar */}
        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Standard Registration</CardTitle>
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

        {/* Main Content */}
        <main>
          <Card className="min-h-[400px]">
            <CardHeader>
              <CardTitle>{currentTitle}</CardTitle>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Step content will be rendered here based on current step */}
              <div className="text-muted-foreground text-center py-12">
                Step component for &ldquo;{step || 'none'}&rdquo; will be rendered here.
                <br />
                <span className="text-sm">(Phase 1B: Component integration pending)</span>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

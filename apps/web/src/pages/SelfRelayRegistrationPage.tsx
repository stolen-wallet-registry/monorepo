/**
 * Self-relay registration flow page.
 *
 * User signs with stolen wallet, then switches to a different wallet to pay gas.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@swr/ui';
import { StepIndicator } from '@/components/composed/StepIndicator';
import { ErrorBoundary, StepErrorFallback } from '@/components/composed/ErrorBoundary';
import { StepRenderer } from '@/components/registration';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import { useRegistrySearch } from '@/hooks/indexer';

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
  const { isConnected, address } = useAccount();
  const { registrationType, step, setRegistrationType } = useRegistrationStore();
  const registeree = useFormStore((s) => s.registeree);
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Check if the registeree (stored or connected wallet) is already registered via indexer
  // In self-relay, the registeree is stored when user first signs
  // This catches both individual and batch registrations
  const registereeToCheck = registeree || address || '';
  const { data: searchResult, isLoading: isCheckingRegistration } =
    useRegistrySearch(registereeToCheck);
  const registereeAlreadyRegistered =
    searchResult?.type === 'address' && searchResult.foundInWalletRegistry;

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

  // Redirect if registeree is already registered (can't register same wallet twice)
  useEffect(() => {
    if (!isCheckingRegistration && registereeAlreadyRegistered && step !== 'success') {
      setLocation('/register/wallet');
    }
  }, [isCheckingRegistration, registereeAlreadyRegistered, step, setLocation]);

  if (!isConnected) {
    return null;
  }

  // Show loading skeleton while checking registration status
  if (isCheckingRegistration) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-8">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid lg:grid-cols-[300px_1fr] gap-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  // Block if registeree is already registered (redirect will happen via useEffect)
  if (registereeAlreadyRegistered && step !== 'success') {
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
              <ErrorBoundary fallback={<StepErrorFallback />}>
                <StepRenderer currentStep={step} onStepComplete={goToNextStep} />
              </ErrorBoundary>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

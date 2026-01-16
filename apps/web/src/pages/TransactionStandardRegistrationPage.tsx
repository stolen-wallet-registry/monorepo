/**
 * Standard transaction registration flow page.
 *
 * User signs and pays from the same wallet.
 * Includes transaction selection as the first step.
 */

import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft, Info } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@swr/ui';
import { TransactionStepIndicator } from '@/components/composed/TransactionStepIndicator';
import { TransactionSelector } from '@/components/composed/TransactionSelector';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import {
  TxAcknowledgeSignStep,
  TxAcknowledgePayStep,
  TxGracePeriodStep,
  TxRegisterSignStep,
  TxRegisterPayStep,
  TxSuccessStep,
} from '@/components/registration/tx-steps';
import { useUserTransactions, useMerkleTree, type TransactionLeaf } from '@/hooks/transactions';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import {
  useTransactionRegistrationFlow,
  getTxNextStep,
  type TransactionRegistrationStep,
} from '@/stores/transactionRegistrationStore';
import type { Hash } from '@/lib/types/ethereum';

/**
 * Step descriptions for standard transaction flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions': 'Choose fraudulent transactions to report',
  'acknowledge-sign': 'Sign the EIP-712 acknowledgement message',
  'acknowledge-pay': 'Submit the acknowledgement transaction',
  'grace-period': 'Wait for the grace period to complete',
  'register-sign': 'Sign the EIP-712 registration message',
  'register-pay': 'Submit the registration transaction',
  success: 'Registration successful',
};

/**
 * Step titles for standard transaction flow.
 */
const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions': 'Select Transactions',
  'acknowledge-sign': 'Sign Acknowledgement',
  'acknowledge-pay': 'Submit Acknowledgement',
  'grace-period': 'Grace Period',
  'register-sign': 'Sign Registration',
  'register-pay': 'Submit Registration',
  success: 'Complete',
};

/**
 * Tooltip content for each step.
 */
const STEP_TOOLTIPS: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions':
    'Select the transactions you want to report as fraudulent. These will be batched together and registered on-chain.',
  'acknowledge-sign':
    'Sign an EIP-712 message acknowledging your intent to register these transactions as fraudulent.',
  'acknowledge-pay':
    'Submit the acknowledgement transaction to the blockchain. This starts a mandatory grace period.',
  'grace-period': 'A randomized waiting period (1-4 minutes) designed to prevent phishing attacks.',
  'register-sign':
    'Sign the final registration message to confirm your intent after the grace period.',
  'register-pay':
    'Submit the registration transaction to permanently record these transactions as fraudulent.',
  success: 'Your fraudulent transactions have been successfully registered on-chain.',
};

export function TransactionStandardRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep, reset: resetFlow } = useTransactionRegistrationFlow();
  const { selectedTxHashes, setSelectedTxHashes, setReportedChainId, setMerkleRoot } =
    useTransactionSelection();
  // Use stable selectors for form actions to avoid unnecessary re-renders
  const resetForm = useTransactionFormStore((s) => s.reset);
  const setReporter = useTransactionFormStore((s) => s.setReporter);
  const setForwarder = useTransactionFormStore((s) => s.setForwarder);

  // Fetch user transactions
  const {
    transactions,
    isLoading: isLoadingTx,
    error: txError,
    refetch: refetchTx,
  } = useUserTransactions(address);

  // Build Merkle tree from selected transactions
  const transactionLeaves: TransactionLeaf[] = useMemo(() => {
    return selectedTxHashes.map((hash) => ({
      txHash: hash,
      chainId: chainId,
    }));
  }, [selectedTxHashes, chainId]);

  const merkleTree = useMerkleTree(transactionLeaves);

  // Initialize registration type
  useEffect(() => {
    if (registrationType !== 'standard') {
      resetFlow();
    }
  }, [registrationType, resetFlow]);

  // Set initial step if null
  useEffect(() => {
    if (step === null) {
      setStep('select-transactions');
    }
  }, [step, setStep]);

  // Update form state when merkle tree changes
  useEffect(() => {
    if (merkleTree) {
      setMerkleRoot(merkleTree.root);
    }
  }, [merkleTree, setMerkleRoot]);

  // Set reported chain ID when chain changes
  useEffect(() => {
    if (chainId) {
      setReportedChainId(chainId);
    }
  }, [chainId, setReportedChainId]);

  // Set reporter address when connected
  useEffect(() => {
    if (address) {
      setReporter(address);
      setForwarder(address); // Standard registration: same address pays
    }
  }, [address, setReporter, setForwarder]);

  // Redirect if not connected
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
    resetForm();
    setLocation('/register/transactions');
  };

  const handleSelectionChange = (hashes: Hash[]) => {
    setSelectedTxHashes(hashes);
  };

  const handleContinue = () => {
    if (selectedTxHashes.length > 0 && merkleTree) {
      setStep('acknowledge-sign');
    }
  };

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps in the sidebar to complete your registration.';
  const currentTooltip = step ? STEP_TOOLTIPS[step] : undefined;

  // Render step content based on current step
  const renderStepContent = () => {
    switch (step) {
      case 'select-transactions':
        return (
          <div className="space-y-6">
            {/* How it works - above the table */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>How Transaction Registration Works</AlertTitle>
              <AlertDescription className="text-sm mt-2">
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    <strong>Select Transactions</strong> - Choose the transactions to report
                  </li>
                  <li>
                    <strong>Sign Acknowledgement</strong> - Sign an EIP-712 message
                  </li>
                  <li>
                    <strong>Wait for Grace Period</strong> - Short waiting period to prevent abuse
                  </li>
                  <li>
                    <strong>Sign & Submit Registration</strong> - Complete on-chain registration
                  </li>
                </ol>
              </AlertDescription>
            </Alert>

            {/* Transaction Selector */}
            <TransactionSelector
              transactions={transactions}
              selectedHashes={selectedTxHashes}
              onSelectionChange={handleSelectionChange}
              isLoading={isLoadingTx}
              error={txError?.message ?? null}
              onRefresh={refetchTx}
              chainId={chainId}
              maxSelections={100}
            />

            {/* Summary and Continue */}
            {selectedTxHashes.length > 0 && merkleTree && (
              <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-sm min-w-0 flex-1">
                  <span className="font-medium">{selectedTxHashes.length} transactions</span>
                  <span className="text-muted-foreground"> selected</span>
                  <div
                    className="text-xs text-muted-foreground mt-1 font-mono break-all"
                    title={merkleTree.root}
                  >
                    Root: {merkleTree.root}
                  </div>
                </div>
                <Button onClick={handleContinue} className="flex-shrink-0">
                  Continue to Sign
                </Button>
              </div>
            )}

            {selectedTxHashes.length === 0 && (
              <div className="flex justify-end">
                <Button disabled>Select transactions to continue</Button>
              </div>
            )}
          </div>
        );

      case 'acknowledge-sign':
        return (
          <TxAcknowledgeSignStep
            onComplete={() => {
              const nextStep = getTxNextStep('standard', 'acknowledge-sign');
              if (nextStep) setStep(nextStep);
            }}
            onBack={() => setStep('select-transactions')}
          />
        );

      case 'acknowledge-pay':
        return (
          <TxAcknowledgePayStep
            onComplete={() => {
              const nextStep = getTxNextStep('standard', 'acknowledge-pay');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'grace-period':
        return (
          <TxGracePeriodStep
            onComplete={() => {
              const nextStep = getTxNextStep('standard', 'grace-period');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'register-sign':
        return (
          <TxRegisterSignStep
            onComplete={() => {
              const nextStep = getTxNextStep('standard', 'register-sign');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'register-pay':
        return (
          <TxRegisterPayStep
            onComplete={() => {
              const nextStep = getTxNextStep('standard', 'register-pay');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'success':
        return <TxSuccessStep />;

      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <Button type="button" variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Registration Methods
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Standard Registration</CardTitle>
                <InfoTooltip
                  content="Register fraudulent transactions using your own funds. You'll sign and pay from the same wallet."
                  side="right"
                />
              </div>
              <CardDescription>Sign and pay from the same wallet</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionStepIndicator
                registrationType="standard"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content */}
        <main className="self-stretch">
          <Card className="flex flex-col h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{currentTitle}</CardTitle>
                {currentTooltip && <InfoTooltip content={currentTooltip} side="right" />}
              </div>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">{renderStepContent()}</CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

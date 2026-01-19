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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
import { chainIdToCAIP2, chainIdToCAIP2String, getChainName } from '@/lib/caip';
import { MERKLE_ROOT_TOOLTIP } from '@/lib/utils';
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
  'select-transactions': 'Select transactions that were fraudulent or represent stolen funds',
  'acknowledge-sign': 'Sign EIP-712 message to report these transactions as fraudulent',
  'acknowledge-pay': 'Submit acknowledgement to begin fraud report',
  'grace-period': 'Anti-phishing waiting period',
  'register-sign': 'Sign final message to confirm fraud report',
  'register-pay': 'Submit to permanently register as fraudulent',
  success: 'Fraud report submitted to registry',
};

/**
 * Step titles for standard transaction flow.
 */
const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions': 'Select Fraudulent Transactions',
  'acknowledge-sign': 'Sign Fraud Report',
  'acknowledge-pay': 'Submit Report',
  'grace-period': 'Grace Period',
  'register-sign': 'Confirm Registration',
  'register-pay': 'Finalize Registration',
  success: 'Report Complete',
};

/**
 * Tooltip content for each step.
 */
const STEP_TOOLTIPS: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions':
    'Choose transactions where your funds were stolen, transferred without authorization, or involved in fraud. These will be cryptographically batched and permanently recorded on-chain as evidence of fraudulent activity.',
  'acknowledge-sign':
    'Sign an EIP-712 typed message acknowledging your intent to report these transactions as fraudulent. This signature proves you control the wallet that originated these transactions.',
  'acknowledge-pay':
    'Submit the acknowledgement transaction to the blockchain. This begins a mandatory grace period designed to prevent phishing attacks.',
  'grace-period':
    'A randomized waiting period (1-4 minutes) that prevents single-transaction phishing attacks. This security measure ensures you have time to recognize if you were tricked into signing.',
  'register-sign':
    'Sign the final registration message after the grace period. This confirms your intent to permanently record these transactions as fraudulent.',
  'register-pay':
    'Submit the final registration transaction. This permanently records your fraud report on-chain, making it publicly verifiable and available to exchanges, wallets, and other services.',
  success:
    'Your fraud report has been permanently recorded on the blockchain. Exchanges and wallets can now query this data to help prevent further fraud.',
};

export function TransactionStandardRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep, reset: resetFlow } = useTransactionRegistrationFlow();
  const {
    selectedTxHashes,
    setSelectedTxHashes,
    setSelectedTxDetails,
    setReportedChainId,
    setMerkleRoot,
  } = useTransactionSelection();
  // Use stable selectors for form actions to avoid unnecessary re-renders
  const resetForm = useTransactionFormStore((s) => s.reset);
  const setReporter = useTransactionFormStore((s) => s.setReporter);
  const setForwarder = useTransactionFormStore((s) => s.setForwarder);

  // Fetch user transactions
  const {
    transactions,
    isLoading: isLoadingTx,
    isLoadingMore: isLoadingMoreTx,
    error: txError,
    refetch: refetchTx,
    loadMore: loadMoreTx,
    hasMore: hasMoreTx,
    lowestBlockScanned,
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

  // Update form state when merkle tree changes (clear when selections cleared)
  useEffect(() => {
    if (merkleTree) {
      setMerkleRoot(merkleTree.root);
    } else {
      setMerkleRoot(null);
    }
  }, [merkleTree, setMerkleRoot]);

  // Set reported chain ID when chain changes
  useEffect(() => {
    if (chainId) {
      setReportedChainId(chainId);
      setSelectedTxHashes([]);
      setSelectedTxDetails([]);
      setMerkleRoot(null);
    }
  }, [chainId, setReportedChainId, setSelectedTxHashes, setSelectedTxDetails, setMerkleRoot]);

  // Set reporter address when connected
  useEffect(() => {
    if (address) {
      setReporter(address);
      setForwarder(address); // Standard registration: same address pays
      setSelectedTxHashes([]);
      setSelectedTxDetails([]);
      setMerkleRoot(null);
    }
  }, [
    address,
    setReporter,
    setForwarder,
    setSelectedTxHashes,
    setSelectedTxDetails,
    setMerkleRoot,
  ]);

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
    // Also store full transaction details for display in subsequent steps
    const selectedDetails = transactions
      .filter((tx) => hashes.includes(tx.hash))
      .map((tx) => ({
        hash: tx.hash,
        to: tx.to,
        value: tx.value.toString(),
        blockNumber: tx.blockNumber.toString(),
        timestamp: tx.timestamp,
      }));
    setSelectedTxDetails(selectedDetails);
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
              <AlertTitle>Report Fraudulent Transactions</AlertTitle>
              <AlertDescription className="text-sm mt-2">
                <p className="mb-2 text-muted-foreground">
                  Select transactions where your funds were stolen or transferred without your
                  authorization. This creates a permanent, on-chain fraud report that exchanges and
                  wallets can use to help prevent further fraud.
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    <strong>Select Transactions</strong> - Choose fraudulent or unauthorized
                    transfers
                  </li>
                  <li>
                    <strong>Sign Fraud Report</strong> - Sign an EIP-712 message proving wallet
                    ownership
                  </li>
                  <li>
                    <strong>Grace Period</strong> - Anti-phishing delay to protect against scams
                  </li>
                  <li>
                    <strong>Finalize Registration</strong> - Permanently record report on-chain
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
              isLoadingMore={isLoadingMoreTx}
              error={txError?.message ?? null}
              onRefresh={refetchTx}
              onLoadMore={loadMoreTx}
              hasMore={hasMoreTx}
              lowestBlockScanned={lowestBlockScanned}
              chainId={chainId}
              maxSelections={100}
            />

            {/* Transaction Batch Summary */}
            {selectedTxHashes.length > 0 && merkleTree && (
              <div className="space-y-4">
                {/* Summary Card */}
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-sm font-medium mb-3">Transaction Batch Summary</p>
                  <div className="space-y-3 text-sm">
                    {/* Transaction Count */}
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                        Transactions:
                        <InfoTooltip
                          content={
                            <p className="text-xs">
                              The number of transactions selected for this fraud report batch.
                            </p>
                          }
                          side="right"
                        />
                      </span>
                      <span className="font-mono font-medium">{selectedTxHashes.length}</span>
                    </div>

                    {/* Reported Chain - consolidated with hash */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          Reported Chain:
                          <InfoTooltip
                            content={
                              <p className="text-xs">
                                The network where these transactions occurred. The CAIP-2 identifier
                                is hashed on-chain as the <code>reportedChainId</code> field in the
                                EIP-712 signed message.
                              </p>
                            }
                            side="right"
                          />
                        </span>
                        <span className="font-mono font-medium">
                          {getChainName(chainId)}{' '}
                          <span className="text-muted-foreground text-xs">
                            ({chainIdToCAIP2String(chainId)})
                          </span>
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="font-mono text-xs text-muted-foreground break-all cursor-default ml-0">
                            {chainIdToCAIP2(chainId)}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="text-xs">
                            keccak256 hash of "{chainIdToCAIP2String(chainId)}"
                          </p>
                          <p className="text-xs font-mono break-all mt-1">
                            {chainIdToCAIP2(chainId)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Merkle Root */}
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                        Merkle Root:
                        <InfoTooltip content={MERKLE_ROOT_TOOLTIP} side="right" />
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="font-mono text-xs break-all cursor-default">
                            {merkleTree.root}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="text-xs font-mono break-all">{merkleTree.root}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                {/* Selected Transactions Table */}
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-4 py-2 bg-muted/50 border-b">
                    <p className="text-sm font-medium">Selected Transactions</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-background sticky top-0 z-10">
                        <tr className="border-b bg-muted">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            #
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                            Transaction Hash
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedTxHashes.map((hash, index) => (
                          <tr key={hash} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-muted-foreground">{index + 1}</td>
                            <td className="px-3 py-1.5">
                              <code className="font-mono">{hash}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Continue Button */}
                <div className="flex justify-end">
                  <Button onClick={handleContinue}>Continue to Sign</Button>
                </div>
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

/**
 * Self-relay transaction registration flow page.
 *
 * User signs with their wallet, then switches to a different wallet to pay gas.
 * Follows the same pattern as wallet self-relay but for transaction batches.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { isAddress } from 'viem';
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
  Label,
} from '@swr/ui';
import { TransactionStepIndicator } from '@/components/composed/TransactionStepIndicator';
import { TransactionSelector } from '@/components/composed/TransactionSelector';
import { AddressInput } from '@/components/composed/AddressInput';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { areAddressesEqual } from '@/lib/address';
import type { Address } from '@/lib/types/ethereum';
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
  useTransactionRegistrationType,
  getTxNextStep,
  TX_STEP_SEQUENCES,
  type TransactionRegistrationStep,
} from '@/stores/transactionRegistrationStore';
import type { Hash } from '@/lib/types/ethereum';

/**
 * Step descriptions for self-relay transaction flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions': 'Select transactions that were fraudulent or represent stolen funds',
  'acknowledge-sign': 'Sign EIP-712 message with the wallet that sent these transactions',
  'switch-and-pay-ack': 'Switch to your gas wallet and submit acknowledgement',
  'grace-period': 'Anti-phishing waiting period',
  'register-sign': 'Switch back and sign with your reporter wallet',
  'switch-and-pay-reg': 'Switch to your gas wallet and submit registration',
  success: 'Fraud report submitted to registry',
};

/**
 * Step titles for self-relay transaction flow.
 */
const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions': 'Select Fraudulent Transactions',
  'acknowledge-sign': 'Sign Fraud Report',
  'switch-and-pay-ack': 'Switch Wallet & Submit',
  'grace-period': 'Grace Period',
  'register-sign': 'Sign Registration',
  'switch-and-pay-reg': 'Switch Wallet & Submit',
  success: 'Report Complete',
};

/**
 * Tooltip content for each step.
 */
const STEP_TOOLTIPS: Partial<Record<TransactionRegistrationStep, string>> = {
  'select-transactions':
    'Choose transactions where your funds were stolen. These will be cryptographically batched and permanently recorded on-chain.',
  'acknowledge-sign':
    'Sign an EIP-712 typed message with the wallet that originated these transactions. This proves you control that wallet.',
  'switch-and-pay-ack':
    'Switch to a different wallet with funds to pay the gas fee. This wallet will submit the acknowledgement transaction.',
  'grace-period':
    'A randomized waiting period (1-4 minutes) that prevents single-transaction phishing attacks.',
  'register-sign': 'Switch back to your reporter wallet and sign the final registration message.',
  'switch-and-pay-reg':
    'Switch to your gas wallet again to submit the final registration transaction.',
  success: 'Your fraud report has been permanently recorded on the blockchain.',
};

export function TransactionSelfRelayRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep, reset: resetFlow } = useTransactionRegistrationFlow();
  const { setRegistrationType } = useTransactionRegistrationType();
  const {
    selectedTxHashes,
    setSelectedTxHashes,
    setSelectedTxDetails,
    setReportedChainId,
    setMerkleRoot,
  } = useTransactionSelection();
  const resetForm = useTransactionFormStore((s) => s.reset);
  const setReporter = useTransactionFormStore((s) => s.setReporter);
  const setForwarder = useTransactionFormStore((s) => s.setForwarder);

  // Local state for forwarder address input
  const [forwarderInput, setForwarderInput] = useState('');
  const [forwarderError, setForwarderError] = useState<string | null>(null);

  // Validate forwarder address
  const isForwarderValid = isAddress(forwarderInput);
  const isForwarderSameAsReporter =
    isForwarderValid && address && areAddressesEqual(forwarderInput as Address, address);

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

  // Initialize registration type on mount and normalize step for self-relay flow.
  useEffect(() => {
    if (registrationType !== 'selfRelay') {
      setRegistrationType('selfRelay');
    }

    const allowedSteps = TX_STEP_SEQUENCES.selfRelay;
    if (step === null || !allowedSteps.includes(step)) {
      setStep('select-transactions');
    }
  }, [registrationType, setRegistrationType, step, setStep]);

  // Update form state when merkle tree changes
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

  // Set reporter address when on select-transactions step
  // IMPORTANT: Only clear selection when on the initial step, not during wallet switches for payment
  useEffect(() => {
    if (address && step === 'select-transactions') {
      // In self-relay, connected wallet during selection is the reporter
      // Forwarder is set when user switches wallet for payment
      setReporter(address);
      setSelectedTxHashes([]);
      setSelectedTxDetails([]);
      setMerkleRoot(null);
    }
  }, [address, step, setReporter, setSelectedTxHashes, setSelectedTxDetails, setMerkleRoot]);

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
    // Validate forwarder
    if (!isForwarderValid) {
      setForwarderError('Please enter a valid Ethereum address for the gas wallet.');
      return;
    }
    if (isForwarderSameAsReporter) {
      setForwarderError('Gas wallet must be different from the reporter wallet.');
      return;
    }
    setForwarderError(null);

    if (selectedTxHashes.length > 0 && merkleTree && address) {
      // Store addresses in form store
      setReporter(address);
      setForwarder(forwarderInput as Address);
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
            {/* How it works */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Self-Relay: Sign with one wallet, pay with another</AlertTitle>
              <AlertDescription className="text-sm mt-2">
                <p className="mb-2 text-muted-foreground">
                  Use this method when your reporter wallet has no funds for gas. You'll sign with
                  the wallet that sent the fraudulent transactions, then switch to a funded wallet
                  to pay gas fees.
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    <strong>Select Transactions</strong> - Choose fraudulent transfers
                  </li>
                  <li>
                    <strong>Sign with Reporter Wallet</strong> - Prove wallet ownership
                  </li>
                  <li>
                    <strong>Switch & Pay</strong> - Use a different wallet for gas
                  </li>
                  <li>
                    <strong>Grace Period</strong> - Anti-phishing delay
                  </li>
                  <li>
                    <strong>Sign & Finalize</strong> - Complete the registration
                  </li>
                </ol>
              </AlertDescription>
            </Alert>

            {/* Wallet Address Inputs */}
            <div className="rounded-lg border p-4 bg-muted/30 space-y-4">
              <p className="text-sm font-medium">Wallet Configuration</p>

              {/* Reporter wallet (read-only - connected wallet) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="reporter">Reporter Wallet</Label>
                  <InfoTooltip
                    content="The wallet that sent the transactions you're reporting as stolen. Signing with this wallet proves you control it and links your fraud report to these transactions."
                    side="right"
                  />
                </div>
                <AddressInput
                  id="reporter"
                  value={address ?? ''}
                  readOnly
                  addressType="ethereum"
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Your currently connected wallet. This must be the wallet that sent the
                  transactions you're reporting.
                </p>
              </div>

              {/* Gas wallet (forwarder) input */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="forwarder">Gas Wallet Address</Label>
                  <InfoTooltip
                    content="This is a separate wallet you control that has funds for gas fees. After signing with your reporter wallet, you'll switch to this wallet to submit the transaction."
                    side="right"
                  />
                </div>
                <AddressInput
                  id="forwarder"
                  value={forwarderInput}
                  onChange={(e) => {
                    setForwarderInput(e.target.value);
                    setForwarderError(null);
                  }}
                  placeholder="0x..."
                  addressType="ethereum"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the address of the wallet you'll use to pay gas fees. You'll need to switch
                  to this wallet after signing.
                </p>
                {forwarderError && <p className="text-sm text-destructive">{forwarderError}</p>}
                {isForwarderSameAsReporter && !forwarderError && (
                  <p className="text-sm text-destructive">
                    Gas wallet must be different from the reporter wallet.
                  </p>
                )}
              </div>
            </div>

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
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-sm font-medium mb-3">Transaction Batch Summary</p>
                  <div className="space-y-3 text-sm">
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

                    <div className="flex flex-col gap-1">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          Reported Chain:
                          <InfoTooltip
                            content={
                              <p className="text-xs">
                                The network where these transactions occurred.
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
                        </TooltipContent>
                      </Tooltip>
                    </div>

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
              </div>
            )}

            {/* Continue Button - single button with conditional state */}
            <div className="flex justify-end">
              {selectedTxHashes.length > 0 &&
              merkleTree &&
              isForwarderValid &&
              !isForwarderSameAsReporter ? (
                <Button onClick={handleContinue}>Continue to Sign</Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button disabled>
                        {selectedTxHashes.length === 0
                          ? 'Select transactions to continue'
                          : 'Enter a valid gas wallet address'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {selectedTxHashes.length === 0
                      ? 'Select at least one transaction to report as fraudulent'
                      : !isForwarderValid
                        ? 'Enter a valid Ethereum address for the gas wallet'
                        : 'Gas wallet must be different from the reporter wallet'}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        );

      case 'acknowledge-sign':
        return (
          <TxAcknowledgeSignStep
            onComplete={() => {
              const nextStep = getTxNextStep('selfRelay', 'acknowledge-sign');
              if (nextStep) setStep(nextStep);
            }}
            onBack={() => setStep('select-transactions')}
          />
        );

      case 'switch-and-pay-ack':
        return (
          <TxAcknowledgePayStep
            onComplete={() => {
              const nextStep = getTxNextStep('selfRelay', 'switch-and-pay-ack');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'grace-period':
        return (
          <TxGracePeriodStep
            onComplete={() => {
              const nextStep = getTxNextStep('selfRelay', 'grace-period');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'register-sign':
        return (
          <TxRegisterSignStep
            onComplete={() => {
              const nextStep = getTxNextStep('selfRelay', 'register-sign');
              if (nextStep) setStep(nextStep);
            }}
          />
        );

      case 'switch-and-pay-reg':
        return (
          <TxRegisterPayStep
            onComplete={() => {
              const nextStep = getTxNextStep('selfRelay', 'switch-and-pay-reg');
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
                <CardTitle className="text-lg">Self-Relay Registration</CardTitle>
                <InfoTooltip
                  content="Sign with your reporter wallet, pay gas with a different wallet that has funds."
                  side="right"
                />
              </div>
              <CardDescription>Sign with one wallet, pay with another</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionStepIndicator
                registrationType="selfRelay"
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

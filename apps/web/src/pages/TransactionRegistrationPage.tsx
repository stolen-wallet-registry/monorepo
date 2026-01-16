/**
 * Transaction registration page.
 *
 * Allows users to select fraudulent transactions and register them
 * as a batch in the StolenTransactionRegistry.
 *
 * NOTE: This is a simplified initial implementation. The full step-based
 * flow (similar to wallet registration) will be implemented in a future iteration.
 */

import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft, FileWarning } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@swr/ui';
import { TransactionSelector } from '@/components/composed/TransactionSelector';
import { useUserTransactions, useMerkleTree, type TransactionLeaf } from '@/hooks/transactions';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import {
  useTransactionRegistrationFlow,
  TX_STEP_SEQUENCES,
} from '@/stores/transactionRegistrationStore';
import type { Hash } from '@/lib/types/ethereum';

export function TransactionRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();

  // Form state
  const { selectedTxHashes, setSelectedTxHashes, setReportedChainId, setMerkleRoot } =
    useTransactionSelection();
  const formStore = useTransactionFormStore();

  // Registration flow state
  const { registrationType, step, setStep, reset: resetFlow } = useTransactionRegistrationFlow();

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
      formStore.setReporter(address);
      formStore.setForwarder(address); // Standard registration: same address pays
    }
  }, [address, formStore]);

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
    formStore.reset();
    setLocation('/');
  };

  const handleSelectionChange = (hashes: Hash[]) => {
    setSelectedTxHashes(hashes);
  };

  const handleContinue = () => {
    if (selectedTxHashes.length > 0 && merkleTree) {
      // Move to next step (acknowledge-sign)
      setStep('acknowledge-sign');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <Button type="button" variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Button>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileWarning className="h-8 w-8 text-amber-500" />
            <div>
              <CardTitle>Report Fraudulent Transactions</CardTitle>
              <CardDescription>
                Select the transactions you want to report as fraudulent. These will be recorded
                on-chain in a batch registration.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

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
        className="mb-6"
      />

      {/* Summary Card - shows when transactions are selected */}
      {selectedTxHashes.length > 0 && merkleTree && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Batch Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Transactions Selected</p>
                <p className="font-medium">{selectedTxHashes.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Chain</p>
                <p className="font-medium font-mono text-xs">{`eip155:${chainId}`}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Merkle Root</p>
                <code className="text-xs font-mono break-all">{merkleTree.root}</code>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Alert */}
      <Alert className="mb-6">
        <AlertTitle>How Transaction Registration Works</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            1. <strong>Select Transactions</strong> - Choose the transactions you want to report
          </p>
          <p>
            2. <strong>Sign Acknowledgement</strong> - Sign an EIP-712 message to acknowledge your
            report
          </p>
          <p>
            3. <strong>Wait for Grace Period</strong> - A short waiting period to prevent abuse
          </p>
          <p>
            4. <strong>Sign & Submit Registration</strong> - Complete the on-chain registration
          </p>
        </AlertDescription>
      </Alert>

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={selectedTxHashes.length === 0 || !merkleTree}
        >
          Continue to Sign ({selectedTxHashes.length} selected)
        </Button>
      </div>

      {/* Current Step Display (for development) */}
      {step && step !== 'select-transactions' && (
        <Card className="mt-6 border-amber-500">
          <CardHeader>
            <CardTitle className="text-lg">Step: {step}</CardTitle>
            <CardDescription>
              Full step implementation coming soon. Current step sequence:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {TX_STEP_SEQUENCES[registrationType].map((s) => (
                <Badge key={s} variant={s === step ? 'default' : 'outline'}>
                  {s}
                </Badge>
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setStep('select-transactions')}
            >
              Back to Selection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

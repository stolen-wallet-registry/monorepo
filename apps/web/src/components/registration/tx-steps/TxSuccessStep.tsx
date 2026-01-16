/**
 * Transaction batch registration success step.
 *
 * Displays confirmation after successful registration.
 */

import { useLocation } from 'wouter';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { clearAllTxSignatures } from '@/lib/signatures/transactions';
import { getExplorerTxUrl, getChainName } from '@/lib/explorer';
import { logger } from '@/lib/logger';
import { CheckCircle2, Home, RefreshCw } from 'lucide-react';

/**
 * Transaction batch registration success step.
 */
export function TxSuccessStep() {
  const [, setLocation] = useLocation();
  const {
    acknowledgementHash,
    acknowledgementChainId,
    registrationHash,
    registrationChainId,
    reset: resetRegistration,
  } = useTransactionRegistrationStore();
  const { selectedTxHashes, merkleRoot } = useTransactionSelection();
  const formStore = useTransactionFormStore();

  /**
   * Reset all state and go home.
   */
  const handleGoHome = () => {
    logger.registration.info('User navigating home, resetting transaction registration state', {
      merkleRoot,
      acknowledgementHash,
      registrationHash,
      transactionCount: selectedTxHashes.length,
    });
    resetRegistration();
    formStore.reset();
    clearAllTxSignatures();
    setLocation('/');
  };

  /**
   * Reset and register more transactions.
   */
  const handleRegisterAnother = () => {
    logger.registration.info('User starting new transaction registration, resetting state', {
      previousMerkleRoot: merkleRoot,
      previousTransactionCount: selectedTxHashes.length,
    });
    resetRegistration();
    formStore.reset();
    clearAllTxSignatures();
    setLocation('/register/transactions');
  };

  // Get explorer URLs using stored chain IDs
  const ackExplorerUrl =
    acknowledgementHash && acknowledgementChainId
      ? getExplorerTxUrl(acknowledgementChainId, acknowledgementHash)
      : null;
  const regExplorerUrl =
    registrationHash && registrationChainId
      ? getExplorerTxUrl(registrationChainId, registrationHash)
      : null;

  return (
    <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/50">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 p-3 rounded-full bg-green-100 dark:bg-green-900 w-fit">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-2xl text-green-700 dark:text-green-300">
          Registration Complete!
        </CardTitle>
        <CardDescription className="text-green-600 dark:text-green-400">
          Your transactions have been successfully registered as fraudulent.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Batch summary */}
        {merkleRoot && (
          <div className="rounded-lg bg-white dark:bg-gray-900 border p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Registration Summary</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Transactions Registered:</span>
                <span className="font-medium">{selectedTxHashes.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">Merkle Root:</span>
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
                  {merkleRoot}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Transaction links */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Transaction History</p>

          {acknowledgementHash && acknowledgementChainId && (
            <div className="rounded-lg bg-white dark:bg-gray-900 border p-3">
              <p className="text-sm font-medium mb-1">
                Acknowledgement
                <span className="text-xs text-muted-foreground ml-2">
                  ({getChainName(acknowledgementChainId)})
                </span>
              </p>
              <ExplorerLink value={acknowledgementHash} href={ackExplorerUrl} />
            </div>
          )}

          {registrationHash && registrationChainId && (
            <div className="rounded-lg bg-white dark:bg-gray-900 border p-3">
              <p className="text-sm font-medium mb-1">
                Registration
                <span className="text-xs text-muted-foreground ml-2">
                  ({getChainName(registrationChainId)})
                </span>
              </p>
              <ExplorerLink value={registrationHash} href={regExplorerUrl} />
            </div>
          )}
        </div>

        {/* What happens next */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
            What happens next?
          </p>
          <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>Your transactions are now marked as fraudulent on-chain</li>
            <li>Exchanges and services can query this registry</li>
            <li>This helps track and potentially recover stolen funds</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={handleGoHome} className="flex-1">
            <Home className="mr-2 h-4 w-4" />
            Go Home
          </Button>
          <Button onClick={handleRegisterAnother} className="flex-1">
            <RefreshCw className="mr-2 h-4 w-4" />
            Register More Transactions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

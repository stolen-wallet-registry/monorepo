/**
 * Success step.
 *
 * Displays confirmation after successful registration.
 */

import { useChainId } from 'wagmi';
import { useLocation } from 'wouter';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { clearAllSignatures } from '@/lib/signatures';
import { getExplorerTxUrl, getExplorerAddressUrl } from '@/lib/explorer';
import { logger } from '@/lib/logger';
import { CheckCircle2, Home, RefreshCw } from 'lucide-react';

/**
 * Success step - shows confirmation after registration.
 */
export function SuccessStep() {
  const [, setLocation] = useLocation();
  const chainId = useChainId();
  const {
    acknowledgementHash,
    registrationHash,
    reset: resetRegistration,
  } = useRegistrationStore();
  const { registeree, reset: resetForm } = useFormStore();

  /**
   * Reset all state and go home.
   */
  const handleGoHome = () => {
    logger.registration.info('User navigating home, resetting registration state', {
      registeree,
      acknowledgementHash,
      registrationHash,
    });
    resetRegistration();
    resetForm();
    clearAllSignatures();
    setLocation('/');
  };

  /**
   * Reset and register another wallet.
   */
  const handleRegisterAnother = () => {
    logger.registration.info('User starting new registration, resetting state', {
      previousRegisteree: registeree,
    });
    resetRegistration();
    resetForm();
    clearAllSignatures();
    // Stay on registration, will redirect to method selection
    setLocation('/');
  };

  // Get explorer URLs
  const ackExplorerUrl = acknowledgementHash
    ? getExplorerTxUrl(chainId, acknowledgementHash)
    : null;
  const regExplorerUrl = registrationHash ? getExplorerTxUrl(chainId, registrationHash) : null;

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
          Your wallet has been successfully registered in the Stolen Wallet Registry.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Registered wallet */}
        {registeree && (
          <div className="rounded-lg bg-white dark:bg-gray-900 border p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Registered Wallet</p>
            <ExplorerLink
              value={registeree}
              type="address"
              href={getExplorerAddressUrl(chainId, registeree)}
              truncate={false}
            />
          </div>
        )}

        {/* Transaction links */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Transaction History</p>

          {acknowledgementHash && (
            <div className="rounded-lg bg-white dark:bg-gray-900 border p-3">
              <p className="text-sm font-medium mb-1">Acknowledgement</p>
              <ExplorerLink value={acknowledgementHash} href={ackExplorerUrl} />
            </div>
          )}

          {registrationHash && (
            <div className="rounded-lg bg-white dark:bg-gray-900 border p-3">
              <p className="text-sm font-medium mb-1">Registration</p>
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
            <li>Your wallet is now marked as stolen on-chain</li>
            <li>Exchanges and services can query this registry</li>
            <li>This helps protect the ecosystem from stolen funds</li>
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
            Register Another Wallet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

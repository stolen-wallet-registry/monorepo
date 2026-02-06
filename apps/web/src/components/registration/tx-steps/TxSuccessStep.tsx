/**
 * Transaction batch registration success step.
 *
 * Displays confirmation after successful registration.
 */

import { useLocation } from 'wouter';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  HyperlaneLogo,
} from '@swr/ui';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { ChainIcon } from '@/components/composed/ChainIcon';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { clearAllTxSignatures, computeTransactionDataHash } from '@/lib/signatures/transactions';
import type { Hash } from '@/lib/types/ethereum';
import {
  getExplorerTxUrl,
  getChainName,
  getBridgeMessageByIdUrl,
  getBridgeMessageUrl,
} from '@/lib/explorer';
import { isSpokeChain, getHubChainId } from '@/lib/chains/config';
import { chainIdToBytes32, toCAIP2 } from '@swr/chains';
import { DATA_HASH_TOOLTIP } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { CheckCircle2, Home, RefreshCw, Heart, ArrowRight } from 'lucide-react';

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
    bridgeMessageId,
    reset: resetRegistration,
  } = useTransactionRegistrationStore();
  const {
    selectedTxHashes,
    selectedTxDetails,
    reportedChainId,
    txHashesForContract,
    chainIdsForContract,
  } = useTransactionSelection();

  // V2: Compute dataHash from sorted arrays for display
  const dataHash: Hash | undefined =
    txHashesForContract.length > 0 &&
    chainIdsForContract.length > 0 &&
    txHashesForContract.length === chainIdsForContract.length
      ? computeTransactionDataHash(txHashesForContract, chainIdsForContract)
      : undefined;
  const formStore = useTransactionFormStore();
  // Guard against invalid chain IDs (must be positive safe integer)
  const reportedChainIdHash =
    reportedChainId != null && Number.isSafeInteger(reportedChainId) && reportedChainId > 0
      ? chainIdToBytes32(reportedChainId)
      : null;
  const reportedChainIdString =
    reportedChainId != null && Number.isSafeInteger(reportedChainId) && reportedChainId > 0
      ? toCAIP2(reportedChainId)
      : null;

  // Determine if this was a cross-chain registration
  const isCrossChain = registrationChainId ? isSpokeChain(registrationChainId) : false;
  const hubChainId = registrationChainId ? getHubChainId(registrationChainId) : undefined;

  // Get bridge explorer URL - prefer direct message ID link if available
  const bridgeExplorerUrl = bridgeMessageId
    ? getBridgeMessageByIdUrl(bridgeMessageId)
    : registrationHash && registrationChainId
      ? getBridgeMessageUrl(registrationHash, registrationChainId)
      : null;

  /**
   * Reset all state and go home.
   */
  const handleGoHome = () => {
    logger.registration.info('User navigating home, resetting transaction registration state', {
      dataHash,
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
      previousDataHash: dataHash,
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
        <div className="rounded-lg bg-white dark:bg-gray-900 border p-4">
          <p className="text-sm font-medium mb-3">Registration Summary</p>
          <div className="space-y-3 text-sm">
            {/* Transaction count */}
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                Transactions:
                <InfoTooltip
                  content={
                    <p className="text-xs">
                      The number of transactions included in this fraud report batch.
                    </p>
                  }
                  side="right"
                />
              </span>
              <span className="font-mono font-medium">{selectedTxHashes.length}</span>
            </div>

            {/* Reported Chain with CAIP-2 */}
            {reportedChainId && (
              <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                    Reported Chain:
                    <InfoTooltip
                      content={
                        <p className="text-xs">
                          The network where these transactions occurred. The CAIP-2 identifier is
                          hashed on-chain as the <code>reportedChainId</code> field in the EIP-712
                          signed message.
                        </p>
                      }
                      side="right"
                    />
                  </span>
                  <span className="font-mono font-medium">
                    {getChainName(reportedChainId)}{' '}
                    <span className="text-muted-foreground text-xs">({reportedChainIdString})</span>
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <code className="font-mono text-xs text-muted-foreground break-all cursor-default">
                      {reportedChainIdHash}
                    </code>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-md">
                    <p className="text-xs">keccak256 hash of "{reportedChainIdString}"</p>
                    <p className="text-xs font-mono break-all mt-1">{reportedChainIdHash}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Data Hash */}
            {dataHash && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                  Data Hash:
                  <InfoTooltip content={DATA_HASH_TOOLTIP} side="right" />
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <code className="font-mono text-xs break-all cursor-default">{dataHash}</code>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-md">
                    <p className="text-xs font-mono break-all">{dataHash}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>

        {/* Selected Transactions Table */}
        {selectedTxDetails.length > 0 && (
          <SelectedTransactionsTable
            transactions={selectedTxDetails}
            showValue
            showBlock
            reportedChainId={reportedChainId}
          />
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

          {/* Cross-chain bridge info */}
          {isCrossChain && hubChainId && registrationHash && registrationChainId && (
            <div className="rounded-lg bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 p-3">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium">Cross-Chain Message</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center size-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-help">
                      <HyperlaneLogo className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Relayed via Hyperlane</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {bridgeMessageId && (
                <ExplorerLink value={bridgeMessageId} type="message" href={bridgeExplorerUrl} />
              )}
              <div className="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 mt-2">
                <ChainIcon chainId={registrationChainId} badge />
                <span>{getChainName(registrationChainId)}</span>
                <ArrowRight className="h-3 w-3" />
                <ChainIcon chainId={hubChainId} badge />
                <span>{getChainName(hubChainId)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Registration submitted on {getChainName(registrationChainId)}, settled on{' '}
                {getChainName(hubChainId)}.
              </p>
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

        {/* Support the registry */}
        <div className="rounded-lg bg-pink-50 dark:bg-pink-950 border border-pink-200 dark:border-pink-800 p-4">
          <p className="text-sm font-medium text-pink-700 dark:text-pink-300 mb-2 flex items-center gap-2">
            <Heart className="h-4 w-4" fill="currentColor" />
            Support the Registry
          </p>
          <p className="text-sm text-pink-600 dark:text-pink-400 mb-3">
            Mint a commemorative soulbound token to show your support for fraud prevention in Web3.
          </p>
          <Button
            onClick={() => setLocation('/soulbound')}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white"
          >
            <Heart className="mr-2 h-4 w-4" fill="currentColor" />
            Mint Support Token
          </Button>
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

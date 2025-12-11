/**
 * Wallet switch prompt component.
 *
 * Guides users to switch to the correct wallet for the current step.
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { truncateAddress, areAddressesEqual } from '@/lib/address';
import { Wallet, ArrowRight, Check, AlertTriangle } from 'lucide-react';

export type WalletStatus = 'correct' | 'wrong-wallet' | 'wrong-network' | 'disconnected';

export interface WalletSwitchPromptProps {
  /** Currently connected wallet address */
  currentAddress: `0x${string}` | null;
  /** Required wallet address for this step */
  expectedAddress: `0x${string}`;
  /** Label for the expected wallet (e.g., "Stolen Wallet", "Gas Wallet") */
  expectedLabel: string;
  /** Current network chain ID */
  currentChainId?: number;
  /** Expected network chain ID */
  expectedChainId?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Determines wallet status based on current vs expected state.
 */
function getWalletStatus(
  currentAddress: `0x${string}` | null,
  expectedAddress: `0x${string}`,
  currentChainId?: number,
  expectedChainId?: number
): WalletStatus {
  if (!currentAddress) return 'disconnected';
  if (expectedChainId && currentChainId && currentChainId !== expectedChainId) {
    return 'wrong-network';
  }
  if (!areAddressesEqual(currentAddress, expectedAddress)) return 'wrong-wallet';
  return 'correct';
}

/**
 * Displays wallet switching guidance for self-relay flow.
 */
export function WalletSwitchPrompt({
  currentAddress,
  expectedAddress,
  expectedLabel,
  currentChainId,
  expectedChainId,
  className,
}: WalletSwitchPromptProps) {
  const status = getWalletStatus(currentAddress, expectedAddress, currentChainId, expectedChainId);

  if (status === 'correct') {
    return (
      <Alert
        className={cn(
          'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950',
          className
        )}
      >
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-700 dark:text-green-300">
          Correct Wallet Connected
        </AlertTitle>
        <AlertDescription className="text-green-600 dark:text-green-400">
          <span className="font-mono">{truncateAddress(expectedAddress, 6)}</span> ({expectedLabel})
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'disconnected') {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Wallet Not Connected</AlertTitle>
        <AlertDescription>
          Please connect your <strong>{expectedLabel}</strong> to continue.
          <div className="mt-2 font-mono text-sm">
            Expected: {truncateAddress(expectedAddress, 6)}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'wrong-network') {
    return (
      <Alert
        className={cn(
          'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950',
          className
        )}
      >
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-700 dark:text-amber-300">Wrong Network</AlertTitle>
        <AlertDescription className="text-amber-600 dark:text-amber-400">
          Please switch to the correct network to continue.
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              Chain {currentChainId}
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant="outline" className="font-mono border-amber-500">
              Chain {expectedChainId}
            </Badge>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // wrong-wallet
  return (
    <Alert
      className={cn(
        'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950',
        className
      )}
    >
      <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-700 dark:text-amber-300">Switch Wallet Required</AlertTitle>
      <AlertDescription className="text-amber-600 dark:text-amber-400">
        <p className="mb-3">
          Please switch to your <strong>{expectedLabel}</strong> to continue.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide opacity-70">Current:</span>
            <Badge variant="outline" className="font-mono">
              {truncateAddress(currentAddress!, 6)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 mx-2" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide opacity-70">Expected:</span>
            <Badge variant="outline" className="font-mono border-amber-500">
              {truncateAddress(expectedAddress, 6)}
            </Badge>
            <span className="text-xs">({expectedLabel})</span>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}

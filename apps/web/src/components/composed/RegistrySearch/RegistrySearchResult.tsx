/**
 * Result card for registry search.
 *
 * Displays the status of a searched wallet address with appropriate styling
 * for registered, pending, and not-found states.
 */

import { Alert, AlertTitle, AlertDescription, Badge } from '@swr/ui';
import { AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { ExplorerLink } from '@/components/composed/ExplorerLink';
import { cn } from '@/lib/utils';
import type { RegistrationData, AcknowledgementData } from '@/hooks';
import type { Address } from '@/lib/types/ethereum';

export type ResultStatus = 'registered' | 'pending' | 'not-found';

export interface RegistrySearchResultProps {
  /** The address that was searched */
  address: Address;
  /** Status of the wallet */
  status: ResultStatus;
  /** Registration data (if registered) */
  registrationData?: RegistrationData | null;
  /** Acknowledgement data (if pending) */
  acknowledgementData?: AcknowledgementData | null;
  /** Additional class names */
  className?: string;
}

/**
 * Displays search result based on wallet status.
 */
export function RegistrySearchResult({
  address,
  status,
  registrationData,
  acknowledgementData,
  className,
}: RegistrySearchResultProps) {
  if (status === 'registered') {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          Registered as Stolen
          <Badge variant="destructive" className="text-xs">
            Compromised
          </Badge>
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            This wallet (<code className="text-xs break-all">{address}</code>) has been registered
            as stolen.
          </p>
          {registrationData && (
            <div className="text-xs space-y-1 mt-2 pt-2 border-t border-destructive/20">
              <p>
                <span className="text-muted-foreground">Registered at block:</span>{' '}
                {registrationData.registeredAt.toString()}
              </p>
              {registrationData.isSponsored && (
                <p>
                  <Badge variant="outline" className="text-xs">
                    Sponsored Registration
                  </Badge>
                </p>
              )}
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'pending') {
    return (
      <Alert
        className={cn(
          'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-900 dark:text-yellow-100',
          className
        )}
      >
        <Clock className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="flex items-center gap-2 text-yellow-900 dark:text-yellow-100">
          Pending Registration
          <Badge
            variant="outline"
            className="text-xs border-yellow-500 text-yellow-700 dark:text-yellow-300"
          >
            In Progress
          </Badge>
        </AlertTitle>
        <AlertDescription className="space-y-2 text-yellow-800 dark:text-yellow-200">
          <p>
            This wallet (<code className="text-xs break-all">{address}</code>) has an
            acknowledgement pending. Registration may complete soon.
          </p>
          {acknowledgementData && (
            <div className="text-xs space-y-1 mt-2 pt-2 border-t border-yellow-300 dark:border-yellow-700">
              <p className="flex items-center gap-1">
                <span className="text-yellow-600 dark:text-yellow-400">Trusted forwarder:</span>{' '}
                <ExplorerLink type="address" value={acknowledgementData.trustedForwarder} />
              </p>
              <p>
                <span className="text-yellow-600 dark:text-yellow-400">Grace period starts:</span>{' '}
                Block {acknowledgementData.startBlock.toString()}
              </p>
              <p>
                <span className="text-yellow-600 dark:text-yellow-400">Expires:</span> Block{' '}
                {acknowledgementData.expiryBlock.toString()}
              </p>
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // not-found state
  return (
    <Alert
      className={cn(
        'border-green-500 bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100',
        className
      )}
    >
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
        Not Registered
        <Badge
          variant="outline"
          className="text-xs border-green-500 text-green-700 dark:text-green-300"
        >
          Clean
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-green-800 dark:text-green-200">
        <p>
          This wallet (<code className="text-xs break-all">{address}</code>) is not in the stolen
          wallet registry.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Badge component displaying operator capabilities.
 *
 * Shows which registries an operator is authorized to submit to.
 */

import { Badge } from '@swr/ui';
import { Shield, Wallet, FileText, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OperatorBadgeProps {
  /** Operator identifier (name) */
  identifier: string;
  /** Capabilities bitmask */
  capabilities: number;
  /** Whether operator is currently approved */
  approved: boolean;
  /** Show detailed capability badges */
  showCapabilities?: boolean;
  /** Additional class names */
  className?: string;
}

// Capability bits
const CAPABILITY_WALLET = 0x01;
const CAPABILITY_TRANSACTION = 0x02;
const CAPABILITY_CONTRACT = 0x04;

/**
 * Displays operator status and capabilities.
 */
export function OperatorBadge({
  identifier,
  capabilities,
  approved,
  showCapabilities = true,
  className,
}: OperatorBadgeProps) {
  const canSubmitWallet = (capabilities & CAPABILITY_WALLET) !== 0;
  const canSubmitTransaction = (capabilities & CAPABILITY_TRANSACTION) !== 0;
  const canSubmitContract = (capabilities & CAPABILITY_CONTRACT) !== 0;

  if (!approved) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Badge variant="outline" className="text-xs text-muted-foreground">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {identifier}
          <span className="ml-1 text-destructive">(Revoked)</span>
        </Badge>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <Badge variant="secondary" className="text-xs">
        <Shield className="w-3 h-3 mr-1" />
        {identifier}
      </Badge>
      {showCapabilities && (
        <>
          {canSubmitWallet && (
            <Badge variant="outline" className="text-xs">
              <Wallet className="w-3 h-3 mr-1" />
              Wallet
            </Badge>
          )}
          {canSubmitTransaction && (
            <Badge variant="outline" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              Transaction
            </Badge>
          )}
          {canSubmitContract && (
            <Badge variant="outline" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Contract
            </Badge>
          )}
        </>
      )}
    </div>
  );
}

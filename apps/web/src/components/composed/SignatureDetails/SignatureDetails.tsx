/**
 * Displays EIP-712 signature data details.
 *
 * Shows registeree, trustedForwarder, nonce, deadline, and chain info.
 * Used in SignatureCard and P2P payment steps.
 */

import { Badge } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { EnsExplorerLink } from '@/components/composed/EnsExplorerLink';
import { getChainShortName } from '@/lib/explorer';
import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';
import type { RegistryType } from '@/lib/types';

export interface SignatureDetailsData {
  /** Wallet being registered (wallet registry) or reporting (transaction registry) */
  registeree: Address;
  /** Wallet that will submit transaction (pays gas) */
  trustedForwarder: Address;
  /** Signature nonce */
  nonce: bigint;
  /** Block deadline for signature validity */
  deadline: bigint;
  /** Chain ID where signature is valid */
  chainId?: number;
}

export interface SignatureDetailsProps {
  /** The signature data to display */
  data: SignatureDetailsData;
  /** Registry type context for label display */
  registryType?: RegistryType;
  /** Additional class names */
  className?: string;
}

/**
 * Displays EIP-712 signature data in a compact, readable format.
 */
export function SignatureDetails({
  data,
  registryType = 'wallet',
  className,
}: SignatureDetailsProps) {
  // Labels and tooltips based on registry type
  const isTransactionRegistry = registryType === 'transaction';
  const registereeLabel = isTransactionRegistry ? 'Reporter:' : 'Registeree:';
  const registereeTooltip = isTransactionRegistry
    ? 'The wallet reporting these transactions as stolen. This wallet must have sent the transactions being reported.'
    : 'The wallet address being registered as stolen. This is the compromised wallet being reported.';

  return (
    <div className={cn('rounded-lg bg-muted p-4 space-y-2 font-mono text-sm', className)}>
      {/* Chain info */}
      {data.chainId && (
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            Network:
            <InfoTooltip
              content="The blockchain network where this signature is valid. Signatures are chain-specific and cannot be used on other networks."
              size="sm"
            />
          </span>
          <Badge variant="outline" className="font-mono">
            {getChainShortName(data.chainId)}
          </Badge>
        </div>
      )}
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground flex items-center gap-1">
          {registereeLabel}
          <InfoTooltip content={registereeTooltip} size="sm" />
        </span>
        <EnsExplorerLink value={data.registeree} type="address" showDisabledIcon={false} />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground flex items-center gap-1">
          Forwarder:
          <InfoTooltip
            content="The wallet that will submit the transaction and pay gas fees. In P2P relay, this is the relayer's wallet."
            size="sm"
          />
        </span>
        <EnsExplorerLink value={data.trustedForwarder} type="address" showDisabledIcon={false} />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground flex items-center gap-1">
          Nonce:
          <InfoTooltip
            content="A unique number that prevents replay attacks. Each signature uses a different nonce to ensure it can only be used once."
            size="sm"
          />
        </span>
        <span>{data.nonce.toString()}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground flex items-center gap-1">
          Deadline:
          <InfoTooltip
            content="The block number after which this signature expires. This prevents old signatures from being used maliciously."
            size="sm"
          />
        </span>
        <span>Block {data.deadline.toString()}</span>
      </div>
    </div>
  );
}

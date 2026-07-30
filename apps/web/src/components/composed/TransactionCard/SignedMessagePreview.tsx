/**
 * Read-only preview of the EIP-712 message the user signed.
 *
 * Extracted from TransactionCard because it is a self-contained region: it renders
 * only from the signed message (plus the network badge) and owns the single piece of
 * local state it needs (clipboard feedback for the signature). Keeping the clipboard
 * hook here rather than in the parent means the state lives exactly as long as the
 * block it belongs to.
 */

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { formatTimestamp } from '@swr/search';
import { Check, Copy, FileSignature, Globe } from 'lucide-react';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { truncateAddress } from '@/lib/address';
import { getChainName, getChainShortName } from '@/lib/explorer';
import type { SignedMessageData } from './TransactionCard';

interface SignedMessagePreviewProps {
  /** Type of transaction - drives the explanatory tooltip copy */
  type: 'acknowledgement' | 'registration';
  /** The signed message data to display */
  signedMessage: SignedMessageData;
  /** Chain the signature is valid on, resolved by the parent from props/message */
  resolvedChainId?: number;
}

export function SignedMessagePreview({
  type,
  signedMessage,
  resolvedChainId,
}: SignedMessagePreviewProps) {
  const { copied: signatureCopied, copy: copySignature } = useCopyToClipboard({ resetMs: 2000 });

  const handleCopySignature = () => {
    if (signedMessage.signature) {
      copySignature(signedMessage.signature);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <span>Signed Message</span>
          <InfoTooltip
            content={
              type === 'acknowledgement'
                ? 'This is the EIP-712 acknowledgement message you signed. Submitting this transaction will record your intent to register this wallet as stolen and start the grace period.'
                : 'This is the EIP-712 registration message you signed. Submitting this transaction will permanently mark this wallet as stolen in the on-chain registry.'
            }
            size="sm"
          />
        </div>
        {/* Network badge */}
        {resolvedChainId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="font-mono text-xs gap-1">
                <Globe className="h-3 w-3" />
                {getChainShortName(resolvedChainId)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {getChainName(resolvedChainId)} (Chain ID: {resolvedChainId})
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="space-y-2 font-mono text-sm">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            Registeree:
            <InfoTooltip content="The wallet address being registered as stolen." size="sm" />
          </span>
          <span>{truncateAddress(signedMessage.registeree, 6)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            Forwarder:
            <InfoTooltip
              content="The wallet submitting this transaction and paying gas fees."
              size="sm"
            />
          </span>
          <span>{truncateAddress(signedMessage.trustedForwarder, 6)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            Nonce:
            <InfoTooltip
              content="A unique number preventing replay attacks. Each signature uses a different nonce."
              size="sm"
            />
          </span>
          <span>{signedMessage.nonce.toString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            Deadline:
            <InfoTooltip
              content="The time after which this signature expires and cannot be used."
              size="sm"
            />
          </span>
          {/* A timestamp, not a block number: the signature deadline comes from
              TimingConfig.getSignatureDeadline() (block.timestamp + window) and the contract
              compares it against block.timestamp. Only the grace period is measured in blocks. */}
          <span>{formatTimestamp(signedMessage.deadline)}</span>
        </div>
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Signature
              <InfoTooltip
                content="This cryptographic signature proves that the owner of the reporter wallet authorized this submission. It secures the registration by verifying ownership before any data is recorded on-chain."
                size="sm"
              />
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopySignature}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label={signatureCopied ? 'Copied!' : 'Copy signature'}
                >
                  {signatureCopied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{signatureCopied ? 'Copied!' : 'Copy signature'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs break-all text-muted-foreground/80 cursor-default">
                {signedMessage.signature.slice(0, 26)}...{signedMessage.signature.slice(-24)}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p className="text-xs font-mono break-all">{signedMessage.signature}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

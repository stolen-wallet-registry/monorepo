/**
 * Minted-token views for the support soulbound card: the direct hub mint success state
 * and the gallery of tokens this supporter minted previously.
 *
 * Both are pure renderings of token ids the card already fetched.
 */

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
} from '@swr/ui';
import { Check, Heart, Loader2 } from 'lucide-react';
import { ExplorerLink, getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { cn } from '@/lib/utils';
import type { Address, Hash } from '@/lib/types/ethereum';

interface SupportMintSuccessCardProps {
  /** Support soulbound contract on the hub chain, undefined when unconfigured */
  contractAddress: Address | undefined;
  /** Most recently minted token id, null while unknown */
  latestTokenId: bigint | null;
  isLoadingTokens: boolean;
  isFetchingTokens: boolean;
  /** Hub-chain mint transaction */
  hash: Hash;
  /** Chain the mint transaction was submitted on */
  hubChainId: number;
  onReset: () => void;
  /** Additional class names */
  className?: string;
}

/** Direct hub mint just confirmed. */
export function SupportMintSuccessCard({
  contractAddress,
  latestTokenId,
  isLoadingTokens,
  isFetchingTokens,
  hash,
  hubChainId,
  onReset,
  className,
}: SupportMintSuccessCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-pink-500" fill="currentColor" />
          Support the Registry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            Thank you for supporting the Stolen Wallet Registry!
          </AlertDescription>
        </Alert>

        {/* Display minted NFT - show spinner while fetching/refetching */}
        {latestTokenId !== null && contractAddress && !isFetchingTokens && (
          <div className="flex justify-center py-4">
            <MintedTokenDisplay
              contractAddress={contractAddress}
              tokenId={latestTokenId}
              type="support"
              size={320}
            />
          </div>
        )}
        {(isLoadingTokens || isFetchingTokens) && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Transaction</Label>
          <ExplorerLink value={hash} href={getExplorerTxUrl(hubChainId, hash)} />
        </div>
        <Button variant="outline" onClick={onReset} className="w-full">
          Mint Another
        </Button>
      </CardContent>
    </Card>
  );
}

interface SupportPreviousTokensProps {
  /** Support soulbound contract on the hub chain */
  contractAddress: Address;
  /** Every token id this supporter holds */
  tokenIds: readonly bigint[];
}

/** Gallery of the supporter's three most recent tokens. */
export function SupportPreviousTokens({ contractAddress, tokenIds }: SupportPreviousTokensProps) {
  return (
    <div className="border-t pt-4 mt-4">
      <Label className="text-xs text-muted-foreground mb-2 block">
        Your minted tokens ({tokenIds.length})
      </Label>
      <div className="flex flex-wrap justify-center gap-2">
        {tokenIds.slice(-3).map((tokenId) => (
          <MintedTokenDisplay
            key={tokenId.toString()}
            contractAddress={contractAddress}
            tokenId={tokenId}
            type="support"
            size={140}
          />
        ))}
      </div>
      {tokenIds.length > 3 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          +{tokenIds.length - 3} more tokens
        </p>
      )}
    </div>
  );
}

/**
 * Terminal states of the wallet soulbound card: the token already exists, or it was
 * just minted directly on the hub chain.
 *
 * Both render the minted token (or a spinner while the token id resolves) inside the
 * same card shell, so they live together here.
 */

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
} from '@swr/ui';
import { Award, Check, Loader2 } from 'lucide-react';
import { ExplorerLink, getExplorerTxUrl } from '@/components/composed/ExplorerLink';
import { MintedTokenDisplay } from '@/components/composed/MintedTokenDisplay';
import { cn } from '@/lib/utils';
import type { Address, Hash } from '@/lib/types/ethereum';

interface MintedTokenProps {
  /** Soulbound contract on the hub chain, undefined when the chain is unconfigured */
  contractAddress: Address | undefined;
  /** Minted token id - 0n means "not minted / not resolved yet" */
  tokenId: bigint;
  isLoadingTokenId: boolean;
  /** Additional class names */
  className?: string;
}

/** Token image plus the loading spinner shown while the id resolves. */
function MintedToken({
  contractAddress,
  tokenId,
  isLoadingTokenId,
}: Omit<MintedTokenProps, 'className'>) {
  return (
    <>
      {tokenId > 0n && contractAddress && (
        <div className="flex justify-center py-4">
          <MintedTokenDisplay
            contractAddress={contractAddress}
            tokenId={tokenId}
            type="wallet"
            size={320}
          />
        </div>
      )}
      {isLoadingTokenId && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}

/** Wallet has minted before - show the existing token. */
export function WalletAlreadyMintedCard({
  contractAddress,
  tokenId,
  isLoadingTokenId,
  className,
}: MintedTokenProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Wallet Soulbound Token
        </CardTitle>
        <CardDescription>On-chain proof your wallet is in the registry</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>This wallet has already minted its soulbound token.</AlertDescription>
        </Alert>

        {/* Display the minted NFT */}
        <MintedToken
          contractAddress={contractAddress}
          tokenId={tokenId}
          isLoadingTokenId={isLoadingTokenId}
        />
      </CardContent>
    </Card>
  );
}

interface WalletMintSuccessCardProps extends MintedTokenProps {
  /** Hub-chain mint transaction */
  hash: Hash;
  /** Chain the mint transaction was submitted on */
  hubChainId: number;
  onReset: () => void;
}

/** Direct hub mint just confirmed. */
export function WalletMintSuccessCard({
  contractAddress,
  tokenId,
  isLoadingTokenId,
  hash,
  hubChainId,
  onReset,
  className,
}: WalletMintSuccessCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Wallet Soulbound Token
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            Successfully minted your Wallet Soulbound token!
          </AlertDescription>
        </Alert>

        {/* Display minted NFT */}
        <MintedToken
          contractAddress={contractAddress}
          tokenId={tokenId}
          isLoadingTokenId={isLoadingTokenId}
        />

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Transaction</Label>
          <ExplorerLink value={hash} href={getExplorerTxUrl(hubChainId, hash)} />
        </div>
        <Button variant="outline" onClick={onReset} className="w-full">
          Done
        </Button>
      </CardContent>
    </Card>
  );
}

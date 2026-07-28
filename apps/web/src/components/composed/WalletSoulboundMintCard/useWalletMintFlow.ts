/**
 * State and side effects behind the wallet soulbound mint card.
 *
 * Every hook the card needs lives here, in the order the card used to call them:
 * eligibility and mint status, the direct hub mint, the cross-chain mint plus its
 * confirmation polling, and the fee/gas quotes. The card itself is then pure
 * presentation.
 */

import { useState, useEffect } from 'react';
import { useSwitchChain } from 'wagmi';
import {
  useCanMint,
  useHasMinted,
  useMintWalletSoulbound,
  useWalletTokenId,
  useQuoteCrossChainMintFee,
  useCrossChainWalletMint,
  useCrossChainMintGasEstimate,
  useCrossChainSoulboundConfirmation,
} from '@/hooks/soulbound';
import { useEthPrice } from '@/hooks/useEthPrice';
import { getChainName } from '@/lib/chains/config';
import { getWalletSoulboundAddress } from '@swr/chains';
import { getBrowserLanguage } from '@/lib/browser';
import type { Address, Hash } from '@/lib/types/ethereum';

export function useWalletMintFlow(wallet: Address, onSuccess?: (txHash: Hash) => void) {
  // Language defaults to browser language, can be overridden via preview modal
  const [language, setLanguage] = useState(getBrowserLanguage);
  // Capture spoke chain ID at mint time so confirmation uses correct chain even if user switches
  const [mintedSpokeChainId, setMintedSpokeChainId] = useState<number | undefined>(undefined);

  const { canMint, reason, isLoading: isCheckingEligibility } = useCanMint({ address: wallet });
  const {
    hasMinted,
    isLoading: isCheckingMinted,
    refetch: refetchHasMinted,
  } = useHasMinted({
    address: wallet,
  });

  // Direct hub mint hook
  const {
    mint,
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    hash,
    reset,
    isOnHubChain,
    hubChainId,
  } = useMintWalletSoulbound();

  // Cross-chain mint hooks (for spoke chains)
  const {
    data: crossChainFee,
    isOnSpokeChain,
    currentChainId,
    isLoading: isLoadingFee,
    isError: isFeeError,
    error: feeError,
  } = useQuoteCrossChainMintFee();
  const {
    requestMint: requestCrossChainMint,
    isPending: isCrossChainPending,
    isConfirming: isCrossChainConfirming,
    isConfirmed: isCrossChainConfirmed,
    isError: isCrossChainError,
    error: crossChainError,
    hash: crossChainHash,
    reset: resetCrossChain,
  } = useCrossChainWalletMint();

  // Cross-chain confirmation tracking (polls hub chain for mint completion)
  const {
    status: confirmationStatus,
    messageId,
    explorerUrl,
    isMintedOnHub,
    elapsedTime,
    reset: resetConfirmation,
  } = useCrossChainSoulboundConfirmation({
    spokeHash: crossChainHash,
    spokeChainId: mintedSpokeChainId,
    mintType: 'wallet',
    wallet,
    enabled: isCrossChainConfirmed && !!crossChainHash,
  });

  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: ethPriceData } = useEthPrice();
  const ethPrice = ethPriceData?.usd ?? 0;

  // Gas estimate for cross-chain mint
  const { data: gasEstimate, isLoading: isLoadingGas } = useCrossChainMintGasEstimate({
    mintType: 'wallet',
    wallet,
    feeWei: crossChainFee?.feeWei,
    enabled: isOnSpokeChain && !!crossChainFee,
  });

  // Get tokenId for displaying minted NFT (enabled when already minted OR after confirmation, including cross-chain)
  const { tokenId, isLoading: isLoadingTokenId } = useWalletTokenId({
    wallet,
    enabled: hasMinted || isConfirmed || isMintedOnHub,
  });

  // Resolve contract address safely (can throw for unconfigured chains)
  let walletSoulboundAddress: ReturnType<typeof getWalletSoulboundAddress> | undefined;
  try {
    walletSoulboundAddress = getWalletSoulboundAddress(hubChainId);
  } catch {
    walletSoulboundAddress = undefined;
  }

  const isLoading = isCheckingEligibility || isCheckingMinted;
  const isMinting = isPending || isConfirming;
  const isCrossChainMinting = isCrossChainPending || isCrossChainConfirming;
  const hubChainName = getChainName(hubChainId);
  const currentChainName = currentChainId ? getChainName(currentChainId) : 'current chain';
  // Use the captured spoke chain for display after mint is initiated
  const mintedSpokeChainName = mintedSpokeChainId
    ? getChainName(mintedSpokeChainId)
    : currentChainName;

  const handleSwitchChain = () => {
    switchChain({ chainId: hubChainId });
  };

  // Refetch hasMinted when mint confirms so "Done" shows correct state (both direct and cross-chain)
  useEffect(() => {
    if (isConfirmed || isMintedOnHub) {
      refetchHasMinted();
    }
  }, [isConfirmed, isMintedOnHub, refetchHasMinted]);

  // Direct hub mint handler
  const handleMint = async () => {
    try {
      const txHash = await mint({ wallet });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Cross-chain mint handler
  const handleCrossChainMint = async () => {
    if (!crossChainFee) return;
    // Capture current chain at mint time so confirmation uses correct chain
    setMintedSpokeChainId(currentChainId);
    try {
      const txHash = await requestCrossChainMint({
        wallet,
        feeWei: crossChainFee.feeWei,
      });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Reset handler for both mint types
  const handleReset = () => {
    reset();
    resetCrossChain();
    resetConfirmation();
    setMintedSpokeChainId(undefined);
  };

  return {
    // Preview language
    language,
    setLanguage,
    // Eligibility
    canMint,
    reason,
    isLoading,
    hasMinted,
    // Token
    walletSoulboundAddress,
    tokenId,
    isLoadingTokenId,
    // Direct hub mint
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    hash,
    isOnHubChain,
    hubChainId,
    isMinting,
    handleMint,
    // Cross-chain mint
    crossChainFee,
    isOnSpokeChain,
    isLoadingFee,
    isFeeError,
    feeError,
    isCrossChainPending,
    isCrossChainConfirming,
    isCrossChainConfirmed,
    isCrossChainError,
    crossChainError,
    crossChainHash,
    isCrossChainMinting,
    gasEstimate,
    isLoadingGas,
    ethPrice,
    handleCrossChainMint,
    // Cross-chain confirmation
    confirmationStatus,
    messageId,
    explorerUrl,
    isMintedOnHub,
    elapsedTime,
    mintedSpokeChainId,
    // Chains
    hubChainName,
    currentChainName,
    mintedSpokeChainName,
    isSwitching,
    handleSwitchChain,
    // Reset
    handleReset,
  };
}

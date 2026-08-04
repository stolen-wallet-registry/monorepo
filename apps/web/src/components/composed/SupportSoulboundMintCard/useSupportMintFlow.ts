/**
 * State and side effects behind the support soulbound mint card.
 *
 * Every hook the card needs lives here, in the order the card used to call them:
 * donation amount entry (linked ETH/USD fields), the direct hub mint, the cross-chain
 * mint plus its confirmation polling, and the token list refetch that runs once a mint
 * lands. The card itself is then pure presentation.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { parseEther } from 'viem';
import {
  useMinDonation,
  useMintSupportSoulbound,
  useSupportTokens,
  useQuoteCrossChainMintFee,
  useCrossChainSupportMint,
  useCrossChainMintGasEstimate,
  useCrossChainSoulboundConfirmation,
} from '@/hooks/soulbound';
import { useEthPrice } from '@/hooks/useEthPrice';
import { getChainName } from '@/lib/chains/config';
import { getSupportSoulboundAddress } from '@swr/chains';
import { getBrowserLanguage } from '@/lib/browser';
import type { Hash } from '@/lib/types/ethereum';

export function useSupportMintFlow(onSuccess?: (txHash: Hash) => void) {
  // Language defaults to browser language, can be overridden via preview modal
  const [language, setLanguage] = useState(getBrowserLanguage);
  const [ethInput, setEthInput] = useState('0.01');
  const [usdInput, setUsdInput] = useState('');
  const lastInputRef = useRef<'eth' | 'usd'>('eth');
  // Capture spoke chain ID at mint time so confirmation uses correct chain even if user switches
  const [mintedSpokeChainId, setMintedSpokeChainId] = useState<number | undefined>(undefined);

  const { address: connectedAddress } = useAccount();
  const { minWei, isLoading: isLoadingMin } = useMinDonation();
  const { data: ethPriceData } = useEthPrice();
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
  } = useMintSupportSoulbound();

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
  } = useCrossChainSupportMint();

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
    mintType: 'support',
    wallet: connectedAddress,
    enabled: isCrossChainConfirmed && !!crossChainHash && !!connectedAddress,
  });

  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Get tokens for displaying minted NFT (always enabled if connected)
  const {
    tokenIds: existingTokenIds,
    latestTokenId,
    refetch: refetchTokens,
    isLoading: isLoadingTokens,
    isFetching: isFetchingTokens,
  } = useSupportTokens({
    supporter: connectedAddress,
    enabled: !!connectedAddress,
  });

  // Check if user has any previously minted tokens
  const hasPreviousTokens = existingTokenIds.length > 0 && !isConfirmed;

  const hubChainName = getChainName(hubChainId);
  const currentChainName = currentChainId ? getChainName(currentChainId) : 'current chain';
  // Use the captured spoke chain for display after mint is initiated
  const mintedSpokeChainName = mintedSpokeChainId
    ? getChainName(mintedSpokeChainId)
    : currentChainName;
  const isCrossChainMinting = isCrossChainPending || isCrossChainConfirming;

  const handleSwitchChain = () => {
    switchChain({ chainId: hubChainId });
  };

  // Resolve contract address safely (mirrors hook pattern)
  let supportSoulboundAddress: ReturnType<typeof getSupportSoulboundAddress> | undefined;
  try {
    supportSoulboundAddress = getSupportSoulboundAddress(hubChainId);
  } catch {
    supportSoulboundAddress = undefined;
  }

  const isMinting = isPending || isConfirming;
  const ethPrice = ethPriceData?.usd ?? 0;

  // Parse ETH input to wei
  const donationWei = useMemo(() => {
    try {
      const value = parseFloat(ethInput);
      if (isNaN(value) || value <= 0) return 0n;
      return parseEther(value.toString());
    } catch {
      return 0n;
    }
  }, [ethInput]);

  // Gas estimate for cross-chain mint
  const { data: gasEstimate, isLoading: isLoadingGas } = useCrossChainMintGasEstimate({
    mintType: 'support',
    donationWei,
    feeWei: crossChainFee?.feeWei,
    enabled: isOnSpokeChain && !!crossChainFee && donationWei > 0n,
  });

  // Calculate USD from ETH
  const calculatedUsd = useMemo(() => {
    const ethValue = parseFloat(ethInput);
    if (isNaN(ethValue) || !ethPrice) return '';
    return (ethValue * ethPrice).toFixed(2);
  }, [ethInput, ethPrice]);

  // Update USD display when ETH changes (only if ETH was last input)
  useEffect(() => {
    if (lastInputRef.current === 'eth' && calculatedUsd) {
      setUsdInput(calculatedUsd);
    }
  }, [calculatedUsd]);

  // Handle ETH input change
  const handleEthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    lastInputRef.current = 'eth';
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setEthInput(value);
    }
  }, []);

  // Handle USD input change and convert to ETH
  const handleUsdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      lastInputRef.current = 'usd';
      const value = e.target.value;
      if (value === '' || /^\d*\.?\d*$/.test(value)) {
        setUsdInput(value);
        const usdValue = parseFloat(value);
        if (!isNaN(usdValue) && ethPrice > 0) {
          const ethValue = usdValue / ethPrice;
          setEthInput(ethValue.toFixed(6).replace(/\.?0+$/, ''));
        } else if (value === '') {
          setEthInput('');
        }
      }
    },
    [ethPrice]
  );

  // Handle preset button click
  const handlePresetClick = useCallback((amount: number) => {
    lastInputRef.current = 'eth';
    setEthInput(amount.toString());
  }, []);

  // Check if valid (meets minimum)
  const isValidAmount = donationWei > 0n && donationWei >= minWei;

  // Direct hub mint handler
  const handleMint = async () => {
    if (!isValidAmount) return;
    reset();

    try {
      const txHash = await mint({ donationWei });
      onSuccess?.(txHash);
    } catch {
      // Error is handled by the hook
    }
  };

  // Cross-chain mint handler
  const handleCrossChainMint = async () => {
    if (!isValidAmount || !crossChainFee) return;
    resetCrossChain();
    // Capture current chain at mint time so confirmation uses correct chain
    setMintedSpokeChainId(currentChainId);

    try {
      const txHash = await requestCrossChainMint({
        donationWei,
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

  // Refetch tokens after successful mint to get the new token ID.
  // Poll briefly to handle slow indexing and stop when the token shows up or attempts cap out.
  // Triggers for both direct hub mints (isConfirmed) and cross-chain mints (isMintedOnHub).
  useEffect(() => {
    if ((!isConfirmed && !isMintedOnHub) || latestTokenId !== null) {
      return;
    }

    const maxAttempts = 10;
    const intervalMs = 500;
    let attempts = 0;

    refetchTokens();

    const intervalId = setInterval(() => {
      attempts += 1;
      refetchTokens();

      if (latestTokenId !== null || attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [isConfirmed, isMintedOnHub, latestTokenId, refetchTokens]);

  return {
    // Preview language
    language,
    setLanguage,
    // Donation amount
    ethInput,
    usdInput,
    donationWei,
    minWei,
    isLoadingMin,
    isValidAmount,
    ethPrice,
    handleEthChange,
    handleUsdChange,
    handlePresetClick,
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
    // Tokens
    supportSoulboundAddress,
    existingTokenIds,
    latestTokenId,
    isLoadingTokens,
    isFetchingTokens,
    hasPreviousTokens,
    // Reset
    handleReset,
  };
}

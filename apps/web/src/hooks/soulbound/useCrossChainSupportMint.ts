/**
 * Hook to request a SupportSoulbound mint via cross-chain message.
 *
 * Used when the user is on a spoke chain and wants to mint a support soulbound
 * token without switching to the hub chain. The SpokeSoulboundForwarder sends
 * a Hyperlane message to the SoulboundReceiver on the hub chain.
 *
 * Note: The donation amount is held on the spoke chain and must be withdrawn
 * separately. Hyperlane doesn't transfer value cross-chain by default.
 */

import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { zeroAddress } from 'viem';
import { spokeSoulboundForwarderAbi } from '@/lib/contracts/abis';
import { getSpokeSoulboundForwarderAddress } from '@swr/chains';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { isSpokeChain } from '@swr/chains';
import { logger } from '@/lib/logger';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface CrossChainSupportMintParams {
  /** Donation amount in wei (must be >= minDonation) */
  donationWei: bigint;
  /** Cross-chain fee in wei (get from useQuoteCrossChainMintFee) */
  feeWei: bigint;
}

export interface UseCrossChainSupportMintResult {
  /** Function to submit the cross-chain mint request */
  requestMint: (params: CrossChainSupportMintParams) => Promise<Hash>;
  /** Transaction hash if submitted */
  hash: Hash | undefined;
  /** True while waiting for user to confirm in wallet */
  isPending: boolean;
  /** True while waiting for spoke transaction confirmation */
  isConfirming: boolean;
  /** True when spoke transaction is confirmed (message dispatched) */
  isConfirmed: boolean;
  /** True if any error occurred */
  isError: boolean;
  /** Error object if failed */
  error: Error | null;
  /** Reset the hook state */
  reset: () => void;
  /** True if currently connected to a spoke chain */
  isOnSpokeChain: boolean;
  /** True if currently connected to the hub chain */
  isOnHubChain: boolean;
  /** Hub chain ID where soulbound contracts are deployed */
  hubChainId: number;
  /** Current chain ID */
  currentChainId: number | undefined;
}

/**
 * Hook for requesting a cross-chain SupportSoulbound mint from a spoke chain.
 *
 * The flow is:
 * 1. User calls requestMint() with donation and fee
 * 2. SpokeSoulboundForwarder dispatches Hyperlane message to hub
 * 3. Donation is held on spoke chain (withdrawn separately by admin)
 * 4. SoulboundReceiver on hub receives message and mints token
 *
 * Note: This only confirms the spoke transaction. The actual mint happens
 * asynchronously on the hub chain (~1-2 minutes for Hyperlane delivery).
 *
 * @example
 * ```tsx
 * const { requestMint, isPending, isConfirmed, isOnSpokeChain } = useCrossChainSupportMint();
 * const { data: feeData } = useQuoteCrossChainMintFee();
 *
 * const handleMint = async () => {
 *   if (!feeData) return;
 *   await requestMint({
 *     donationWei: parseEther('0.01'),
 *     feeWei: feeData.feeWei
 *   });
 * };
 *
 * if (!isOnSpokeChain) return null; // Use direct mint on hub
 * if (isPending) return <p>Confirm in wallet...</p>;
 * if (isConfirmed) return <p>Request sent! Token will mint on hub in ~1-2 min</p>;
 * return <button onClick={handleMint}>Support from Spoke</button>;
 * ```
 */
export function useCrossChainSupportMint(): UseCrossChainSupportMintResult {
  const hubChainId = getHubChainIdForEnvironment();
  const { chain } = useAccount();
  const currentChainId = chain?.id;
  const isOnHubChain = currentChainId === hubChainId;
  const isOnSpokeChain = currentChainId ? isSpokeChain(currentChainId) : false;

  // Get spoke forwarder address
  let forwarderAddress: Address | null = null;
  if (isOnSpokeChain && currentChainId) {
    try {
      forwarderAddress = getSpokeSoulboundForwarderAddress(currentChainId);
    } catch (error) {
      logger.contract.error('useCrossChainSupportMint: SpokeSoulboundForwarder not configured', {
        chainId: currentChainId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const {
    writeContractAsync,
    data: hash,
    isPending,
    isError: isWriteError,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const requestMint = async (params: CrossChainSupportMintParams): Promise<Hash> => {
    if (!forwarderAddress || forwarderAddress === zeroAddress) {
      logger.contract.error('useCrossChainSupportMint: No forwarder address configured', {
        chainId: currentChainId,
      });
      throw new Error('SpokeSoulboundForwarder not configured for this chain');
    }

    if (!isOnSpokeChain) {
      logger.contract.error('useCrossChainSupportMint: Not on spoke chain', {
        currentChainId,
        hubChainId,
      });
      throw new Error('Cross-chain mint is only available from spoke chains');
    }

    const { donationWei, feeWei } = params;
    const totalValue = donationWei + feeWei;

    logger.contract.info('Requesting cross-chain support mint', {
      chainId: currentChainId,
      forwarderAddress,
      donationWei: donationWei.toString(),
      feeWei: feeWei.toString(),
      totalValue: totalValue.toString(),
    });

    try {
      const txHash = await writeContractAsync({
        address: forwarderAddress,
        abi: spokeSoulboundForwarderAbi,
        functionName: 'requestSupportMint',
        args: [donationWei],
        value: totalValue,
        chainId: currentChainId,
      });

      logger.contract.info('Cross-chain support mint request submitted', {
        txHash,
        donationWei: donationWei.toString(),
        chainId: currentChainId,
      });

      return txHash;
    } catch (error) {
      logger.contract.error('Cross-chain support mint request failed', {
        chainId: currentChainId,
        donationWei: donationWei.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    requestMint,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
    isOnSpokeChain,
    isOnHubChain,
    hubChainId,
    currentChainId,
  };
}

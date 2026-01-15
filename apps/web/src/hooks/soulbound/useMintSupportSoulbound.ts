/**
 * Hook to mint a SupportSoulbound token with a donation.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { zeroAddress } from 'viem';
import { supportSoulboundAbi } from '@/lib/contracts/abis';
import { getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { logger } from '@/lib/logger';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface MintSupportSoulboundParams {
  /** ISO 639-1 language code for the SVG (e.g., 'en', 'es', 'zh') */
  language: string;
  /** Donation amount in wei (must be >= minWei) */
  donationWei: bigint;
}

export interface UseMintSupportSoulboundResult {
  /** Function to submit the mint transaction */
  mint: (params: MintSupportSoulboundParams) => Promise<Hash>;
  /** Transaction hash if submitted */
  hash: Hash | undefined;
  /** True while waiting for user to confirm in wallet */
  isPending: boolean;
  /** True while waiting for transaction confirmation */
  isConfirming: boolean;
  /** True when transaction is confirmed */
  isConfirmed: boolean;
  /** True if any error occurred */
  isError: boolean;
  /** Error object if failed */
  error: Error | null;
  /** Reset the hook state */
  reset: () => void;
}

/**
 * Hook for minting a SupportSoulbound token with a donation.
 *
 * Unlike WalletSoulbound, anyone can mint unlimited SupportSoulbound tokens
 * as long as they meet the minimum donation requirement.
 *
 * @example
 * ```tsx
 * const { mint, isPending, isConfirming, isConfirmed } = useMintSupportSoulbound();
 *
 * const handleMint = async () => {
 *   await mint({ language: 'en', donationWei: parseEther('0.01') });
 * };
 *
 * if (isPending) return <p>Confirm in wallet...</p>;
 * if (isConfirming) return <p>Minting...</p>;
 * if (isConfirmed) return <p>Thank you for your support!</p>;
 * return <button onClick={handleMint}>Support the Registry</button>;
 * ```
 */
export function useMintSupportSoulbound(): UseMintSupportSoulboundResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getSupportSoulboundAddress(chainId);
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useMintSupportSoulbound: Failed to resolve contract address', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    });
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

  const mint = async (params: MintSupportSoulboundParams): Promise<Hash> => {
    if (!contractAddress || contractAddress === zeroAddress) {
      logger.contract.error('useMintSupportSoulbound: No contract address configured', { chainId });
      throw new Error('SupportSoulbound contract not configured for this chain');
    }

    const { language, donationWei } = params;

    logger.contract.info('Minting SupportSoulbound token', {
      chainId,
      contractAddress,
      language,
      donationWei: donationWei.toString(),
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: supportSoulboundAbi,
        functionName: 'mint',
        args: [language],
        value: donationWei,
      });

      logger.contract.info('SupportSoulbound mint transaction submitted', {
        txHash,
        language,
        donationWei: donationWei.toString(),
        chainId,
      });

      return txHash;
    } catch (error) {
      logger.contract.error('SupportSoulbound mint failed', {
        chainId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    mint,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
  };
}

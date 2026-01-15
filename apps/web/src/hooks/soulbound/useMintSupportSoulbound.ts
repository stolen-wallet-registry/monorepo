/**
 * Hook to mint a SupportSoulbound token with a donation.
 *
 * Note: SupportSoulbound contracts are deployed on the hub chain only.
 * The hook exposes `isOnHubChain` and `hubChainId` so the UI can show
 * a manual chain switch button when needed.
 */

import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { zeroAddress } from 'viem';
import { supportSoulboundAbi } from '@/lib/contracts/abis';
import { getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface MintSupportSoulboundParams {
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
  /** True if currently connected to the hub chain */
  isOnHubChain: boolean;
  /** Hub chain ID where soulbound contracts are deployed */
  hubChainId: number;
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
 *   await mint({ donationWei: parseEther('0.01') });
 * };
 *
 * if (isPending) return <p>Confirm in wallet...</p>;
 * if (isConfirming) return <p>Minting...</p>;
 * if (isConfirmed) return <p>Thank you for your support!</p>;
 * return <button onClick={handleMint}>Support the Registry</button>;
 * ```
 */
export function useMintSupportSoulbound(): UseMintSupportSoulboundResult {
  // Soulbound contracts are only deployed on the hub chain
  const hubChainId = getHubChainIdForEnvironment();
  const { chain } = useAccount();
  const isOnHubChain = chain?.id === hubChainId;

  let contractAddress: Address | undefined;
  try {
    contractAddress = getSupportSoulboundAddress(hubChainId);
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useMintSupportSoulbound: Failed to resolve contract address', {
      chainId: hubChainId,
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
      logger.contract.error('useMintSupportSoulbound: No contract address configured', {
        chainId: hubChainId,
      });
      throw new Error('SupportSoulbound contract not configured for this chain');
    }

    const { donationWei } = params;

    // Require user to be on hub chain - UI should show switch button if not
    if (!isOnHubChain) {
      logger.contract.error('useMintSupportSoulbound: Not on hub chain', {
        currentChainId: chain?.id,
        hubChainId,
      });
      throw new Error('Please switch to the hub chain to mint');
    }

    logger.contract.info('Minting SupportSoulbound token', {
      chainId: hubChainId,
      contractAddress,
      donationWei: donationWei.toString(),
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: supportSoulboundAbi,
        functionName: 'mint',
        args: [],
        value: donationWei,
        chainId: hubChainId,
      });

      logger.contract.info('SupportSoulbound mint transaction submitted', {
        txHash,
        donationWei: donationWei.toString(),
        chainId: hubChainId,
      });

      return txHash;
    } catch (error) {
      logger.contract.error('SupportSoulbound mint failed', {
        chainId: hubChainId,
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
    isOnHubChain,
    hubChainId,
  };
}

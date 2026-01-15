/**
 * Hook to mint a WalletSoulbound token for a registered stolen wallet.
 *
 * Note: WalletSoulbound contracts are deployed on the hub chain only.
 * This hook always targets the hub chain and will prompt the user to
 * switch chains if they're connected to a spoke chain.
 */

import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { zeroAddress } from 'viem';
import { walletSoulboundAbi } from '@/lib/contracts/abis';
import { getWalletSoulboundAddress } from '@/lib/contracts/addresses';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface MintWalletSoulboundParams {
  /** Wallet address to mint the token for (must be registered/pending) */
  wallet: Address;
}

export interface UseMintWalletSoulboundResult {
  /** Function to submit the mint transaction */
  mint: (params: MintWalletSoulboundParams) => Promise<Hash>;
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
 * Hook for minting a WalletSoulbound token.
 *
 * The token is minted to the specified wallet (not msg.sender), so anyone
 * can pay for the mint on behalf of a registered wallet.
 *
 * @example
 * ```tsx
 * const { mint, isPending, isConfirming, isConfirmed, isError, error } = useMintWalletSoulbound();
 *
 * const handleMint = async () => {
 *   await mint({ wallet: registeredWallet });
 * };
 *
 * if (isPending) return <p>Confirm in wallet...</p>;
 * if (isConfirming) return <p>Minting...</p>;
 * if (isConfirmed) return <p>Minted!</p>;
 * if (isError) return <p>Error: {error?.message}</p>;
 * return <button onClick={handleMint}>Mint Soulbound</button>;
 * ```
 */
export function useMintWalletSoulbound(): UseMintWalletSoulboundResult {
  // Soulbound contracts are only deployed on the hub chain
  const hubChainId = getHubChainIdForEnvironment();
  const { switchChainAsync } = useSwitchChain();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getWalletSoulboundAddress(hubChainId);
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useMintWalletSoulbound: Failed to resolve contract address', {
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

  const mint = async (params: MintWalletSoulboundParams): Promise<Hash> => {
    if (!contractAddress || contractAddress === zeroAddress) {
      logger.contract.error('useMintWalletSoulbound: No contract address configured', {
        chainId: hubChainId,
      });
      throw new Error('WalletSoulbound contract not configured for this chain');
    }

    const { wallet } = params;

    // Always ensure we're on the hub chain (switchChainAsync is idempotent - no prompt if already on correct chain)
    logger.contract.info('Ensuring hub chain for WalletSoulbound mint', {
      hubChainId,
    });
    await switchChainAsync({ chainId: hubChainId });

    logger.contract.info('Minting WalletSoulbound token', {
      chainId: hubChainId,
      contractAddress,
      wallet,
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: walletSoulboundAbi,
        functionName: 'mintTo',
        args: [wallet],
        chainId: hubChainId,
      });

      logger.contract.info('WalletSoulbound mint transaction submitted', {
        txHash,
        wallet,
        chainId: hubChainId,
      });

      return txHash;
    } catch (error) {
      logger.contract.error('WalletSoulbound mint failed', {
        chainId: hubChainId,
        wallet,
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

/**
 * Hook to submit a transaction batch registration to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow for transaction batches.
 * Must be called after the grace period has elapsed following acknowledgement.
 *
 * Supports both:
 * - Hub chains: Uses StolenTransactionRegistry (on-chain only, local fee)
 * - Spoke chains: Uses SpokeTransactionRegistry (cross-chain, bridge + registration fee)
 */

import { useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi, spokeTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getStolenTransactionRegistryAddress } from '@/lib/contracts/addresses';
import { getSpokeTransactionRegistryAddress } from '@/lib/contracts/crosschain-addresses';
import { isHubChain, isSpokeChain } from '@swr/chains';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxRegistrationParams {
  /** Merkle root of the transaction batch (must match acknowledgement) */
  merkleRoot: Hash;
  /** CAIP-2 chain ID as bytes32 (must match acknowledgement) */
  reportedChainId: Hash;
  /** Transaction hashes in the batch */
  transactionHashes: Hash[];
  /** CAIP-2 chain IDs for each transaction as bytes32 */
  chainIds: Hash[];
  /** Reporter address (wallet signing the registration) */
  reporter: Address;
  /** Signature deadline */
  deadline: bigint;
  /** EIP-712 signature */
  signature: ParsedSignature;
  /** Protocol fee to send with the registration transaction */
  feeWei?: bigint;
}

export interface UseTxRegistrationResult {
  submitRegistration: (params: TxRegistrationParams) => Promise<Hash>;
  hash: Hash | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
  /** Whether using spoke chain (cross-chain) vs hub chain (on-chain only) */
  isSpokeChain: boolean;
}

/**
 * Hook for submitting transaction batch registration transactions.
 *
 * @returns Functions and state for registration submission
 */
export function useTransactionRegistration(): UseTxRegistrationResult {
  const chainId = useChainId();

  // Determine chain role - simple lookups, no memoization needed
  const isSpoke = isSpokeChain(chainId);
  const isHub = isHubChain(chainId);

  // Resolve contract address based on chain role
  const { contractAddress, contractAbi } = useMemo(() => {
    try {
      if (isSpoke) {
        // Spoke chain: use SpokeTransactionRegistry
        const address = getSpokeTransactionRegistryAddress(chainId);
        if (!address) {
          throw new Error(`SpokeTransactionRegistry not configured for chain ${chainId}`);
        }
        logger.contract.debug('useTransactionRegistration: Spoke registry resolved', {
          chainId,
          contractAddress: address,
        });
        return { contractAddress: address, contractAbi: spokeTransactionRegistryAbi };
      } else if (isHub) {
        // Hub chain: use StolenTransactionRegistry
        const address = getStolenTransactionRegistryAddress(chainId);
        logger.contract.debug('useTransactionRegistration: Hub registry resolved', {
          chainId,
          contractAddress: address,
        });
        return { contractAddress: address, contractAbi: stolenTransactionRegistryAbi };
      } else {
        throw new Error(`Chain ${chainId} is neither hub nor spoke`);
      }
    } catch (error) {
      logger.contract.error('useTransactionRegistration: Failed to resolve registry', {
        chainId,
        isSpoke,
        isHub,
        error: error instanceof Error ? error.message : String(error),
      });
      return { contractAddress: undefined, contractAbi: stolenTransactionRegistryAbi };
    }
  }, [chainId, isSpoke, isHub]);

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

  const submitRegistration = async (params: TxRegistrationParams): Promise<Hash> => {
    if (!contractAddress) {
      logger.contract.error('useTransactionRegistration: No contract address configured', {
        chainId,
      });
      throw new Error('Contract not configured for this chain');
    }

    const {
      merkleRoot,
      reportedChainId,
      transactionHashes,
      chainIds,
      reporter,
      deadline,
      signature,
      feeWei,
    } = params;

    logger.registration.info('Submitting transaction batch registration', {
      chainId,
      contractAddress,
      merkleRoot,
      reportedChainId,
      reporter,
      transactionCount: transactionHashes.length,
      deadline: deadline.toString(),
      feeWei: feeWei?.toString() ?? '0',
      isSpoke,
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'register',
        args: [
          merkleRoot,
          reportedChainId,
          transactionHashes,
          chainIds,
          reporter,
          deadline,
          signature.v,
          signature.r,
          signature.s,
        ],
        value: feeWei ?? 0n,
      });

      logger.registration.info('Transaction batch registration submitted', {
        txHash,
        merkleRoot,
        reporter,
        chainId,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('Transaction batch registration failed', {
        chainId,
        merkleRoot,
        reporter,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    submitRegistration,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
    isSpokeChain: isSpoke,
  };
}

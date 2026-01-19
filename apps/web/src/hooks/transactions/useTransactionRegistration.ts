/**
 * Hook to submit a transaction batch registration to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow for transaction batches.
 * Must be called after the grace period has elapsed following acknowledgement.
 */

import { useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getStolenTransactionRegistryAddress } from '@/lib/contracts/addresses';
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
}

/**
 * Hook for submitting transaction batch registration transactions.
 *
 * @returns Functions and state for registration submission
 */
export function useTransactionRegistration(): UseTxRegistrationResult {
  const chainId = useChainId();

  const contractAddress = useMemo(() => {
    try {
      const address = getStolenTransactionRegistryAddress(chainId);
      logger.contract.debug('useTransactionRegistration: Registry address resolved', {
        chainId,
        contractAddress: address,
      });
      return address;
    } catch (error) {
      logger.contract.error('useTransactionRegistration: Failed to resolve registry address', {
        chainId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }, [chainId]);

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
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: stolenTransactionRegistryAbi,
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
  };
}

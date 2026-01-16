/**
 * Hook to submit a transaction batch acknowledgement to the registry contract.
 *
 * This is Phase 1 of the two-phase registration flow for transaction batches.
 * After acknowledgement, a grace period begins before registration can be completed.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getStolenTransactionRegistryAddress } from '@/lib/contracts/addresses';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxAcknowledgementParams {
  /** Merkle root of the transaction batch */
  merkleRoot: Hash;
  /** CAIP-2 chain ID as bytes32 (keccak256("eip155:chainId")) */
  reportedChainId: Hash;
  /** Number of transactions in the batch */
  transactionCount: number;
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
}

export interface UseTxAcknowledgementResult {
  submitAcknowledgement: (params: TxAcknowledgementParams) => Promise<Hash>;
  hash: Hash | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for submitting transaction batch acknowledgement transactions.
 *
 * @returns Functions and state for acknowledgement submission
 */
export function useTransactionAcknowledgement(): UseTxAcknowledgementResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getStolenTransactionRegistryAddress(chainId);
    logger.contract.debug('useTransactionAcknowledgement: Registry address resolved', {
      chainId,
      contractAddress,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useTransactionAcknowledgement: Failed to resolve registry address', {
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

  const submitAcknowledgement = async (params: TxAcknowledgementParams): Promise<Hash> => {
    if (!contractAddress) {
      logger.contract.error('useTransactionAcknowledgement: No contract address configured', {
        chainId,
      });
      throw new Error('Contract not configured for this chain');
    }

    const {
      merkleRoot,
      reportedChainId,
      transactionCount,
      transactionHashes,
      chainIds,
      reporter,
      deadline,
      signature,
    } = params;

    logger.registration.info('Submitting transaction batch acknowledgement', {
      chainId,
      contractAddress,
      merkleRoot,
      reportedChainId,
      transactionCount,
      reporter,
      deadline: deadline.toString(),
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: stolenTransactionRegistryAbi,
        functionName: 'acknowledge',
        args: [
          merkleRoot,
          reportedChainId,
          transactionCount,
          transactionHashes,
          chainIds,
          reporter,
          deadline,
          signature.v,
          signature.r,
          signature.s,
        ],
      });

      logger.registration.info('Transaction batch acknowledgement submitted', {
        txHash,
        merkleRoot,
        reporter,
        chainId,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('Transaction batch acknowledgement failed', {
        chainId,
        merkleRoot,
        reporter,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    submitAcknowledgement,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
  };
}

/**
 * Hook to submit a transaction batch acknowledgement to the registry contract.
 *
 * This is Phase 1 of the two-phase registration flow for transaction batches.
 * After acknowledgement, a grace period begins before registration can be completed.
 *
 * Supports both:
 * - Hub chains: Uses StolenTransactionRegistry (on-chain only)
 * - Spoke chains: Uses SpokeTransactionRegistry (cross-chain to hub)
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
  /** Whether using spoke chain (cross-chain) vs hub chain (on-chain only) */
  isSpokeChain: boolean;
}

/**
 * Hook for submitting transaction batch acknowledgement transactions.
 *
 * @returns Functions and state for acknowledgement submission
 */
export function useTransactionAcknowledgement(): UseTxAcknowledgementResult {
  const chainId = useChainId();

  // Determine chain role
  const isSpoke = useMemo(() => isSpokeChain(chainId), [chainId]);
  const isHub = useMemo(() => isHubChain(chainId), [chainId]);

  // Resolve contract address based on chain role
  const { contractAddress, contractAbi } = useMemo(() => {
    try {
      if (isSpoke) {
        // Spoke chain: use SpokeTransactionRegistry
        const address = getSpokeTransactionRegistryAddress(chainId);
        if (!address) {
          throw new Error(`SpokeTransactionRegistry not configured for chain ${chainId}`);
        }
        logger.contract.debug('useTransactionAcknowledgement: Spoke registry resolved', {
          chainId,
          contractAddress: address,
        });
        return { contractAddress: address, contractAbi: spokeTransactionRegistryAbi };
      } else if (isHub) {
        // Hub chain: use StolenTransactionRegistry
        const address = getStolenTransactionRegistryAddress(chainId);
        logger.contract.debug('useTransactionAcknowledgement: Hub registry resolved', {
          chainId,
          contractAddress: address,
        });
        return { contractAddress: address, contractAbi: stolenTransactionRegistryAbi };
      } else {
        throw new Error(`Chain ${chainId} is neither hub nor spoke`);
      }
    } catch (error) {
      logger.contract.error('useTransactionAcknowledgement: Failed to resolve registry', {
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

    // Validate batch sizes match to fail fast before gas burn
    if (transactionCount !== transactionHashes.length || transactionCount !== chainIds.length) {
      const error = new Error(
        `Batch size mismatch: transactionCount=${transactionCount}, hashes=${transactionHashes.length}, chainIds=${chainIds.length}`
      );
      logger.registration.error('Transaction batch size mismatch', {
        transactionCount,
        hashesLength: transactionHashes.length,
        chainIdsLength: chainIds.length,
      });
      throw error;
    }

    logger.registration.info('Submitting transaction batch acknowledgement', {
      chainId,
      contractAddress,
      merkleRoot,
      reportedChainId,
      transactionCount,
      reporter,
      deadline: deadline.toString(),
      isSpoke,
    });

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: contractAbi,
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
    isSpokeChain: isSpoke,
  };
}

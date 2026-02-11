/**
 * Hook to submit a transaction batch acknowledgement to the registry contract.
 *
 * This is Phase 1 of the two-phase registration flow for transaction batches.
 * After acknowledgement, a grace period begins before registration can be completed.
 *
 * Architecture:
 * - Hub chains: TransactionRegistry.acknowledgeTransactions
 * - Spoke chains: SpokeRegistry.acknowledgeTransactionBatch
 *
 * Both use v, r, s as separate params, but with different argument orders due to
 * cross-chain requirements (spoke needs reportedChainId, transactionCount, nonce).
 */

import { useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress } from '@/lib/contracts/addresses';
import { getSpokeContractAddress } from '@/lib/contracts/crosschain-addresses';
import { isHubChain, isSpokeChain } from '@swr/chains';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

/** Hub chain acknowledgement params */
export interface TxAcknowledgementParamsHub {
  /** Reporter address (wallet signing the registration) */
  reporter: Address;
  /** Trusted forwarder address (same as reporter for self-registration, different for relay) */
  trustedForwarder: Address;
  /** Signature deadline */
  deadline: bigint;
  /** Data hash (merkle root of transaction batch) */
  dataHash: Hash;
  /** CAIP-2 chain ID as bytes32 */
  reportedChainId: Hash;
  /** Number of transactions in the batch */
  transactionCount: number;
  /** EIP-712 signature */
  signature: ParsedSignature;
}

/** Spoke chain acknowledgement params (cross-chain) */
export interface TxAcknowledgementParamsSpoke {
  /** Reporter address (wallet signing the registration) */
  reporter: Address;
  /** Data hash (merkle root of transaction batch) */
  dataHash: Hash;
  /** CAIP-2 chain ID as bytes32 */
  reportedChainId: Hash;
  /** Number of transactions in the batch */
  transactionCount: number;
  /** Signature deadline */
  deadline: bigint;
  /** Signature nonce */
  nonce: bigint;
  /** EIP-712 signature */
  signature: ParsedSignature;
}

/** Union type for acknowledgement params */
export type TxAcknowledgementParams = TxAcknowledgementParamsHub | TxAcknowledgementParamsSpoke;

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
  /** Whether using hub chain */
  isHubChain: boolean;
}

/** Type guard for hub params */
function isHubParams(params: TxAcknowledgementParams): params is TxAcknowledgementParamsHub {
  return 'trustedForwarder' in params;
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
  const contractAddress = useMemo(() => {
    try {
      if (isSpoke) {
        const address = getSpokeContractAddress('spokeRegistry', chainId);
        if (!address) {
          throw new Error(`SpokeRegistry not configured for chain ${chainId}`);
        }
        return address;
      } else if (isHub) {
        return getTransactionRegistryAddress(chainId);
      }
      throw new Error(`Chain ${chainId} is neither hub nor spoke`);
    } catch (error) {
      logger.contract.error('useTransactionAcknowledgement: Failed to resolve registry', {
        chainId,
        isSpoke,
        isHub,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
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

    const { reporter, dataHash, deadline, signature } = params;

    logger.registration.info('Submitting transaction batch acknowledgement', {
      chainId,
      contractAddress,
      reporter,
      dataHash,
      deadline: deadline.toString(),
      isSpoke,
      isHub,
    });

    try {
      let txHash: Hash;

      if (isHub && isHubParams(params)) {
        // Hub: acknowledgeTransactions(reporter, trustedForwarder, deadline, dataHash, reportedChainId, transactionCount, v, r, s)
        // isSponsored is derived on-chain as (reporter != trustedForwarder)
        const { trustedForwarder, reportedChainId, transactionCount } = params;

        txHash = await writeContractAsync({
          address: contractAddress,
          abi: transactionRegistryAbi,
          functionName: 'acknowledgeTransactions',
          args: [
            reporter,
            trustedForwarder,
            deadline,
            dataHash,
            reportedChainId,
            transactionCount,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      } else if (isSpoke && !isHubParams(params)) {
        // Spoke: acknowledgeTransactionBatch(dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s)
        const { reportedChainId, transactionCount, nonce } = params;

        txHash = await writeContractAsync({
          address: contractAddress,
          abi: spokeRegistryAbi,
          functionName: 'acknowledgeTransactionBatch',
          args: [
            dataHash,
            reportedChainId,
            transactionCount,
            deadline,
            nonce,
            reporter,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      } else {
        throw new Error(
          `Params mismatch: got ${isHubParams(params) ? 'hub' : 'spoke'} params but chain is ${isHub ? 'hub' : isSpoke ? 'spoke' : 'unknown'}`
        );
      }

      logger.registration.info('Transaction batch acknowledgement submitted', {
        txHash,
        dataHash,
        reporter,
        chainId,
        isSpoke,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('Transaction batch acknowledgement failed', {
        chainId,
        dataHash,
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
    isHubChain: isHub,
  };
}

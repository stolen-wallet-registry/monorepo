/**
 * Hook to submit a transaction batch registration to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow for transaction batches.
 * Must be called after the grace period has elapsed following acknowledgement.
 *
 * V2 Architecture:
 * - Hub chains: TransactionRegistryV2.registerTransactions
 * - Spoke chains: SpokeRegistryV2.registerTransactionBatch
 *
 * Both use v, r, s as separate params, but with different argument orders due to
 * cross-chain requirements (spoke needs reportedChainId, nonce).
 */

import { useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { transactionRegistryV2Abi, spokeRegistryV2Abi } from '@/lib/contracts/abis';
import { getTransactionRegistryV2Address } from '@/lib/contracts/addresses';
import { getSpokeV2Address } from '@/lib/contracts/crosschain-addresses';
import { isHubChain, isSpokeChain } from '@swr/chains';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

/** Hub chain registration params */
export interface TxRegistrationParamsHub {
  /** Reporter address (wallet signing the registration) */
  reporter: Address;
  /** Signature deadline */
  deadline: bigint;
  /** Transaction hashes in the batch */
  transactionHashes: Hash[];
  /** CAIP-2 chain IDs for each transaction as bytes32 */
  chainIds: Hash[];
  /** EIP-712 signature */
  signature: ParsedSignature;
  /** Protocol fee to send with the registration transaction */
  feeWei?: bigint;
}

/** Spoke chain registration params (cross-chain) */
export interface TxRegistrationParamsSpoke {
  /** Reporter address (wallet signing the registration) */
  reporter: Address;
  /** CAIP-2 chain ID as bytes32 (reported chain where incident occurred) */
  reportedChainId: Hash;
  /** Signature deadline */
  deadline: bigint;
  /** Signature nonce */
  nonce: bigint;
  /** Transaction hashes in the batch */
  transactionHashes: Hash[];
  /** CAIP-2 chain IDs for each transaction as bytes32 */
  chainIds: Hash[];
  /** EIP-712 signature */
  signature: ParsedSignature;
  /** Protocol fee to send with the transaction */
  feeWei?: bigint;
}

/** Union type for registration params */
export type TxRegistrationParams = TxRegistrationParamsHub | TxRegistrationParamsSpoke;

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
  /** Whether using hub chain */
  isHubChain: boolean;
}

/** Type guard for spoke params */
function isSpokeParams(params: TxRegistrationParams): params is TxRegistrationParamsSpoke {
  return 'reportedChainId' in params && 'nonce' in params;
}

/**
 * Hook for submitting transaction batch registration transactions.
 *
 * @returns Functions and state for registration submission
 */
export function useTransactionRegistration(): UseTxRegistrationResult {
  const chainId = useChainId();

  // Determine chain role
  const isSpoke = isSpokeChain(chainId);
  const isHub = isHubChain(chainId);

  // Resolve contract address based on chain role
  const contractAddress = useMemo(() => {
    try {
      if (isSpoke) {
        const address = getSpokeV2Address('spokeRegistryV2', chainId);
        if (!address) {
          throw new Error(`SpokeRegistryV2 not configured for chain ${chainId}`);
        }
        return address;
      } else if (isHub) {
        return getTransactionRegistryV2Address(chainId);
      }
      throw new Error(`Chain ${chainId} is neither hub nor spoke`);
    } catch (error) {
      logger.contract.error('useTransactionRegistration: Failed to resolve registry', {
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

  const submitRegistration = async (params: TxRegistrationParams): Promise<Hash> => {
    if (!contractAddress) {
      logger.contract.error('useTransactionRegistration: No contract address configured', {
        chainId,
      });
      throw new Error('Contract not configured for this chain');
    }

    const { reporter, deadline, transactionHashes, chainIds, signature } = params;

    // Validate batch sizes match
    if (transactionHashes.length !== chainIds.length) {
      const error = new Error(
        `Batch size mismatch: hashes=${transactionHashes.length}, chainIds=${chainIds.length}`
      );
      logger.registration.error('Transaction batch size mismatch', {
        hashesLength: transactionHashes.length,
        chainIdsLength: chainIds.length,
      });
      throw error;
    }

    logger.registration.info('Submitting transaction batch registration', {
      chainId,
      contractAddress,
      reporter,
      transactionCount: transactionHashes.length,
      deadline: deadline.toString(),
      isSpoke,
      isHub,
    });

    try {
      let txHash: Hash;

      if (isHub && !isSpokeParams(params)) {
        // Hub: registerTransactions(reporter, deadline, transactionHashes, chainIds, v, r, s) - payable
        const { feeWei } = params;

        txHash = await writeContractAsync({
          address: contractAddress,
          abi: transactionRegistryV2Abi,
          functionName: 'registerTransactions',
          args: [
            reporter,
            deadline,
            transactionHashes,
            chainIds,
            signature.v,
            signature.r,
            signature.s,
          ],
          value: feeWei ?? 0n,
        });
      } else if (isSpoke && isSpokeParams(params)) {
        // Spoke: registerTransactionBatch(reportedChainId, deadline, nonce, reporter, transactionHashes, chainIds, v, r, s)
        const { reportedChainId, nonce, feeWei } = params;

        txHash = await writeContractAsync({
          address: contractAddress,
          abi: spokeRegistryV2Abi,
          functionName: 'registerTransactionBatch',
          args: [
            reportedChainId,
            deadline,
            nonce,
            reporter,
            transactionHashes,
            chainIds,
            signature.v,
            signature.r,
            signature.s,
          ],
          value: feeWei ?? 0n,
        });
      } else {
        throw new Error(
          `Params mismatch: got ${isSpokeParams(params) ? 'spoke' : 'hub'} params but chain is ${isHub ? 'hub' : isSpoke ? 'spoke' : 'unknown'}`
        );
      }

      logger.registration.info('Transaction batch registration submitted', {
        txHash,
        reporter,
        transactionCount: transactionHashes.length,
        chainId,
        isSpoke,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('Transaction batch registration failed', {
        chainId,
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
    isHubChain: isHub,
  };
}

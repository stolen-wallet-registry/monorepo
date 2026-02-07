/**
 * Hook to read deadline and hash struct from the transaction registry contract.
 * Currently hub-only (TransactionRegistry). Spoke (SpokeRegistry) support is not yet implemented —
 * spoke transaction batches use different function signatures for acknowledgement/registration.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 */

import { useReadContract, useChainId } from 'wagmi';
import { transactionRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress } from '@/lib/contracts/addresses';
import { getSpokeContractAddress } from '@/lib/contracts/crosschain-addresses';
import { isHubChain, isSpokeChain } from '@swr/chains';
import { TX_SIGNATURE_STEP, type TxSignatureStep } from '@/lib/signatures/transactions';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxHashStructData {
  deadline: bigint;
  hashStruct: Hash;
}

/** Result type for refetch operations */
export interface TxHashStructRefetchResult {
  data: TxHashStructData | undefined;
  status: 'success' | 'error';
}

export interface UseTxHashStructResult {
  data: TxHashStructData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<TxHashStructRefetchResult>;
}

/**
 * Reads the deadline and hash struct for signing from the transaction registry contract.
 *
 * @param dataHash - Data hash (merkle root of transaction batch)
 * @param reportedChainId - CAIP-2 chain ID as bytes32
 * @param transactionCount - Number of transactions in the batch
 * @param forwarderAddress - The trusted forwarder address (who can submit the tx)
 * @param step - The signature step (1 = Acknowledgement, 2 = Registration)
 * @returns The deadline and hash struct for the EIP-712 message
 */
export function useTransactionHashStruct(
  dataHash: Hash | undefined,
  reportedChainId: Hash | undefined,
  transactionCount: number | undefined,
  forwarderAddress: Address | undefined,
  step: TxSignatureStep
): UseTxHashStructResult {
  const chainId = useChainId();

  const isSpoke = isSpokeChain(chainId);
  const isHub = isHubChain(chainId);

  // Get contract address
  let contractAddress: Address | undefined;
  if (isSpoke) {
    contractAddress = getSpokeContractAddress('spokeRegistry', chainId);
  } else if (isHub) {
    contractAddress = getTransactionRegistryAddress(chainId);
  }

  const enabled =
    !!dataHash &&
    !!reportedChainId &&
    transactionCount !== undefined &&
    transactionCount > 0 &&
    !!forwarderAddress &&
    !!contractAddress;

  // Hub chain: TransactionRegistry.generateTransactionHashStruct
  const hubResult = useReadContract({
    address: contractAddress,
    abi: transactionRegistryAbi,
    chainId,
    functionName: 'generateTransactionHashStruct',
    args: enabled
      ? [dataHash!, reportedChainId!, transactionCount!, forwarderAddress!, step]
      : undefined,
    query: {
      enabled: enabled && isHub,
      staleTime: 10_000,
    },
  });

  // Note: SpokeRegistry uses different functions for transaction batches
  // (acknowledgeTransactionBatch/registerTransactionBatch) with different signature generation.
  // Transaction hash struct generation is currently only implemented for hub chains.
  // Spoke transaction registration may need separate handling.

  // Use hub result - spoke not yet supported for transaction hash struct
  const result = hubResult;

  if (result.isError) {
    logger.contract.error('generateHashStruct call failed (transaction registry)', {
      chainId,
      contractAddress,
      dataHash,
      transactionCount,
      forwarderAddress,
      step,
      error: result.error?.message,
    });
  }

  // Transform result to standard format
  let transformedData: TxHashStructData | undefined;
  if (result.data && Array.isArray(result.data) && result.data.length >= 2) {
    const [deadline, hashStruct] = result.data as [bigint, Hash];
    transformedData = { deadline, hashStruct };
    logger.contract.debug('generateHashStruct call succeeded (transaction registry)', {
      chainId,
      contractAddress,
      deadline: deadline.toString(),
    });
  }

  // Wrap refetch to return properly typed result
  const refetch = async (): Promise<TxHashStructRefetchResult> => {
    const refetchResult = await result.refetch();
    let refetchedData: TxHashStructData | undefined;
    if (refetchResult.data && Array.isArray(refetchResult.data) && refetchResult.data.length >= 2) {
      const [deadline, hashStruct] = refetchResult.data as [bigint, Hash];
      refetchedData = { deadline, hashStruct };
    }
    return {
      data: refetchedData,
      status: refetchResult.status === 'success' ? 'success' : 'error',
    };
  };

  return {
    data: transformedData,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch,
  };
}

/**
 * Helper to get hash struct for transaction acknowledgement step.
 */
export function useTransactionAcknowledgementHashStruct(
  dataHash: Hash | undefined,
  reportedChainId: Hash | undefined,
  transactionCount: number | undefined,
  forwarderAddress: Address | undefined
): UseTxHashStructResult {
  return useTransactionHashStruct(
    dataHash,
    reportedChainId,
    transactionCount,
    forwarderAddress,
    TX_SIGNATURE_STEP.ACKNOWLEDGEMENT
  );
}

/**
 * Helper to get hash struct for transaction registration step.
 */
export function useTransactionRegistrationHashStruct(
  dataHash: Hash | undefined,
  reportedChainId: Hash | undefined,
  transactionCount: number | undefined,
  forwarderAddress: Address | undefined
): UseTxHashStructResult {
  return useTransactionHashStruct(
    dataHash,
    reportedChainId,
    transactionCount,
    forwarderAddress,
    TX_SIGNATURE_STEP.REGISTRATION
  );
}

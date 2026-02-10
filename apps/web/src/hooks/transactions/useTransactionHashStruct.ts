/**
 * Hook to read deadline and hash struct from the transaction registry contract.
 * Chain-aware: works on both hub (TransactionRegistry) and spoke (SpokeRegistry).
 *
 * Both contracts expose `generateTransactionHashStruct` with the same signature:
 *   (bytes32 dataHash, bytes32 reportedChainId, uint32 transactionCount, address forwarder, uint8 step)
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 */

import { useEffect } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
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

/** Transform raw contract result to typed format */
function transformResult(raw: unknown): TxHashStructData | undefined {
  if (raw && Array.isArray(raw) && raw.length >= 2) {
    const [deadline, hashStruct] = raw as [bigint, Hash];
    return { deadline, hashStruct };
  }
  return undefined;
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

  // Spoke chain: SpokeRegistry.generateTransactionHashStruct (same signature)
  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    chainId,
    functionName: 'generateTransactionHashStruct',
    args: enabled
      ? [dataHash!, reportedChainId!, transactionCount!, forwarderAddress!, step]
      : undefined,
    query: {
      enabled: enabled && isSpoke,
      staleTime: 10_000,
    },
  });

  // Select result based on chain role
  const result = isSpoke ? spokeResult : hubResult;
  const transformedData = transformResult(result.data);

  // Log in useEffect to avoid render-time side effects
  useEffect(() => {
    if (result.isError) {
      logger.contract.error('generateTransactionHashStruct call failed', {
        chainId,
        contractAddress,
        isSpoke,
        dataHash,
        transactionCount,
        forwarderAddress,
        step,
        error: result.error?.message,
      });
    }
  }, [
    result.isError,
    result.error,
    chainId,
    contractAddress,
    isSpoke,
    dataHash,
    transactionCount,
    forwarderAddress,
    step,
  ]);

  useEffect(() => {
    if (transformedData) {
      logger.contract.debug('generateTransactionHashStruct call succeeded', {
        chainId,
        contractAddress,
        isSpoke,
        deadline: transformedData.deadline.toString(),
      });
    }
  }, [transformedData, chainId, contractAddress, isSpoke]);

  // Wrap refetch to return properly typed result
  const refetch = async (): Promise<TxHashStructRefetchResult> => {
    const refetchResult = await result.refetch();
    const refetchedData = transformResult(refetchResult.data);
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

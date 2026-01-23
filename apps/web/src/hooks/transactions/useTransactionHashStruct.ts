/**
 * Hook to read deadline and hash struct from the transaction registry contract.
 * Supports both hub (StolenTransactionRegistry) and spoke (SpokeTransactionRegistry) chains.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 * The transaction registry has a different generateHashStruct signature that includes
 * merkleRoot, chainId, and transactionCount.
 */

import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import { TX_SIGNATURE_STEP, type TxSignatureStep } from '@/lib/signatures/transactions';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxHashStructData {
  deadline: bigint;
  hashStruct: Hash;
}

export interface UseTxHashStructResult {
  data: TxHashStructData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: UseReadContractReturnType['refetch'];
}

/**
 * Reads the deadline and hash struct for signing from the transaction registry contract.
 *
 * @param merkleRoot - Merkle root of the transaction batch
 * @param reportedChainId - CAIP-2 chain ID as bytes32
 * @param transactionCount - Number of transactions in the batch
 * @param forwarderAddress - The trusted forwarder address (who can submit the tx)
 * @param step - The signature step (1 = Acknowledgement, 2 = Registration)
 * @returns The deadline and hash struct for the EIP-712 message
 */
export function useTransactionHashStruct(
  merkleRoot: Hash | undefined,
  reportedChainId: Hash | undefined,
  transactionCount: number | undefined,
  forwarderAddress: Address | undefined,
  step: TxSignatureStep
): UseTxHashStructResult {
  const chainId = useChainId();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTransactionHashStruct'
  );

  // Get the correct ABI for hub/spoke
  const { abi } = getRegistryMetadata('transaction', registryType);

  const enabled =
    !!merkleRoot &&
    !!reportedChainId &&
    transactionCount !== undefined &&
    transactionCount > 0 &&
    !!forwarderAddress &&
    !!contractAddress;

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    functionName: 'generateHashStruct',
    args: enabled
      ? [merkleRoot!, reportedChainId!, transactionCount!, forwarderAddress!, step]
      : undefined,
    query: {
      enabled,
      staleTime: 10_000, // 10 seconds
    },
  });

  if (result.isError) {
    logger.contract.error('generateHashStruct call failed (transaction registry)', {
      chainId,
      contractAddress,
      merkleRoot,
      transactionCount,
      forwarderAddress,
      step,
      error: result.error?.message,
    });
  } else if (result.data) {
    logger.contract.debug('generateHashStruct call succeeded (transaction registry)', {
      chainId,
      contractAddress,
      deadline: result.data[0]?.toString(),
    });
  }

  const transformedData: TxHashStructData | undefined = result.data
    ? {
        deadline: result.data[0],
        hashStruct: result.data[1] as Hash,
      }
    : undefined;

  return {
    data: transformedData,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Helper to get hash struct for transaction acknowledgement step.
 */
export function useTransactionAcknowledgementHashStruct(
  merkleRoot: Hash | undefined,
  reportedChainId: Hash | undefined,
  transactionCount: number | undefined,
  forwarderAddress: Address | undefined
): UseTxHashStructResult {
  return useTransactionHashStruct(
    merkleRoot,
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
  merkleRoot: Hash | undefined,
  reportedChainId: Hash | undefined,
  transactionCount: number | undefined,
  forwarderAddress: Address | undefined
): UseTxHashStructResult {
  return useTransactionHashStruct(
    merkleRoot,
    reportedChainId,
    transactionCount,
    forwarderAddress,
    TX_SIGNATURE_STEP.REGISTRATION
  );
}

/**
 * Hook to read deadline data from the StolenTransactionRegistry contract.
 *
 * Used to determine the grace period window for transaction batch registration.
 */

import { useReadContract, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getStolenTransactionRegistryAddress } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxDeadlineData {
  /** Block number when registration window opens */
  start: bigint;
  /** Block number when registration window closes */
  expiry: bigint;
  /** Current block number */
  currentBlock: bigint;
  /** Block number when grace period started */
  graceStartsAt: bigint;
  /** Blocks remaining until window opens */
  timeLeft: bigint;
  /** Whether the registration window has expired */
  isExpired: boolean;
}

export interface UseTxContractDeadlinesResult {
  data: TxDeadlineData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to read deadline data for a reporter from the transaction registry.
 *
 * Uses the `getDeadlines(reporter)` function which returns all timing info
 * for a pending acknowledgement.
 *
 * @param reporter - The reporter address to get deadlines for
 * @returns The deadline data and loading/error states
 */
export function useTxContractDeadlines(
  reporter: Address | undefined
): UseTxContractDeadlinesResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getStolenTransactionRegistryAddress(chainId);
    logger.contract.debug('Transaction registry address resolved for deadlines', {
      chainId,
      contractAddress,
    });
  } catch (err) {
    contractAddress = undefined;
    logger.contract.error('Failed to resolve transaction registry address for deadlines', {
      chainId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const enabled = !!reporter && !!contractAddress;

  // Read deadlines from contract using getDeadlines(reporter)
  const {
    data: contractData,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContract({
    address: contractAddress,
    abi: stolenTransactionRegistryAbi,
    functionName: 'getDeadlines',
    args: reporter ? [reporter] : undefined,
    chainId,
    query: {
      enabled,
      staleTime: 3_000,
      refetchInterval: 3_000, // Poll every 3 seconds for countdown
    },
  });

  // Log results
  if (isError) {
    logger.contract.error('Failed to read deadlines from transaction registry', {
      chainId,
      contractAddress,
      reporter,
      error: error?.message,
    });
  } else if (contractData) {
    logger.contract.debug('Transaction registry deadlines read', {
      reporter,
      currentBlock: contractData[0]?.toString(),
      expiryBlock: contractData[1]?.toString(),
      startBlock: contractData[2]?.toString(),
      graceStartsAt: contractData[3]?.toString(),
      timeLeft: contractData[4]?.toString(),
      isExpired: contractData[5],
    });
  }

  // Map contract result to TxDeadlineData
  // getDeadlines returns: (currentBlock, expiryBlock, startBlock, graceStartsAt, timeLeft, isExpired)
  // Note: Contract returns uint32 (mapped to number by viem), convert to bigint for interface
  const data: TxDeadlineData | undefined = contractData
    ? {
        currentBlock: BigInt(contractData[0]),
        expiry: BigInt(contractData[1]),
        start: BigInt(contractData[2]),
        graceStartsAt: BigInt(contractData[3]),
        timeLeft: BigInt(contractData[4]),
        isExpired: contractData[5],
      }
    : undefined;

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
  };
}

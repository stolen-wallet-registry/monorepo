/**
 * Hook to read grace period deadlines from the StolenWalletRegistry contract.
 *
 * Returns deadline information for a registered/pending wallet including:
 * - Current block number
 * - Expiry block (when registration window closes)
 * - Start block (when registration window opens after grace period)
 * - Grace period blocks
 * - Deadline block
 * - Whether the registration has expired
 */

import { useReadContract, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getContractAddress } from '@/lib/contracts/addresses';
import { getBlockTime } from '@/lib/blocks';

export interface DeadlineData {
  currentBlock: bigint;
  expiry: bigint;
  start: bigint;
  graceBlocks: bigint;
  deadlineBlock: bigint;
  isExpired: boolean;
}

export interface UseContractDeadlinesResult {
  data: DeadlineData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Reads deadline information for a registeree from the contract.
 *
 * @param registereeAddress - The address to check deadlines for
 * @returns Deadline data including current block, start, expiry, and expired status
 */
export function useContractDeadlines(
  registereeAddress: `0x${string}` | undefined
): UseContractDeadlinesResult {
  const chainId = useChainId();

  // Determine refetch interval based on chain block time
  const blockTimeMs = getBlockTime(chainId) * 1000;
  const refetchInterval = Math.max(blockTimeMs, 2000); // At least 2 seconds

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddress(chainId);
  } catch {
    // Contract not configured for this chain
    contractAddress = undefined;
  }

  const result = useReadContract({
    address: contractAddress,
    abi: stolenWalletRegistryAbi,
    functionName: 'getDeadlines',
    args: registereeAddress ? [registereeAddress] : undefined,
    query: {
      enabled: !!registereeAddress && !!contractAddress,
      refetchInterval, // Refetch roughly each block
      staleTime: refetchInterval / 2,
    },
  });

  // Transform the raw array result into a typed object
  const transformedData: DeadlineData | undefined = result.data
    ? {
        currentBlock: result.data[0],
        expiry: result.data[1],
        start: result.data[2],
        graceBlocks: result.data[3],
        deadlineBlock: result.data[4],
        isExpired: result.data[5],
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

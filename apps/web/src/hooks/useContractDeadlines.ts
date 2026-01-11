/**
 * Hook to read grace period deadlines from the registry contract.
 *
 * Returns deadline information for a registered/pending wallet including:
 * - Current block number
 * - Expiry block (when registration window closes)
 * - Start block (when registration window opens after grace period)
 * - Grace period blocks
 * - Deadline block
 * - Whether the registration has expired
 *
 * Chain-aware: Works with both StolenWalletRegistry (hub) and SpokeRegistry (spoke).
 */

import { useReadContract, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
import { getBlockTime } from '@/lib/blocks';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

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
  registereeAddress: Address | undefined
): UseContractDeadlinesResult {
  const chainId = useChainId();

  // Determine refetch interval based on chain block time
  const blockTimeMs = getBlockTime(chainId) * 1000;
  const refetchInterval = Math.max(blockTimeMs, 2000); // At least 2 seconds

  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
    logger.contract.debug('useContractDeadlines: Registry address resolved', {
      chainId,
      contractAddress,
      registryType,
      registereeAddress,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useContractDeadlines: Failed to resolve registry address', {
      chainId,
      registereeAddress,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Both contracts have identical getDeadlines() function after normalization
  const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId, // Explicit chain ID ensures RPC call targets correct chain
    functionName: 'getDeadlines',
    args: registereeAddress ? [registereeAddress] : undefined,
    query: {
      enabled: !!registereeAddress && !!contractAddress,
      refetchInterval, // Refetch roughly each block
      staleTime: refetchInterval / 2,
    },
  });

  // Transform the raw array result into a typed object
  let transformedData: DeadlineData | undefined;
  if (result.data) {
    // Validate we have all expected fields from the contract
    if (result.data.length !== 6) {
      logger.contract.error('Unexpected getDeadlines result structure', {
        dataLength: result.data.length,
        data: result.data,
      });
      transformedData = undefined;
    } else {
      transformedData = {
        currentBlock: result.data[0],
        expiry: result.data[1],
        start: result.data[2],
        graceBlocks: result.data[3],
        deadlineBlock: result.data[4],
        isExpired: result.data[5],
      };

      // Log deadline data for debugging grace period timer
      const blocksUntilStart = transformedData.start - transformedData.currentBlock;
      logger.contract.debug('getDeadlines response', {
        registeree: registereeAddress,
        currentBlock: transformedData.currentBlock.toString(),
        start: transformedData.start.toString(),
        expiry: transformedData.expiry.toString(),
        graceBlocks: transformedData.graceBlocks.toString(),
        deadlineBlock: transformedData.deadlineBlock.toString(),
        isExpired: transformedData.isExpired,
        blocksUntilStart: blocksUntilStart.toString(),
        windowAlreadyOpen: blocksUntilStart <= 0n,
      });
    }
  }

  return {
    data: transformedData,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

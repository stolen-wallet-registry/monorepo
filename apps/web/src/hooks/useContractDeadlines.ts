/**
 * Hooks to read grace period deadlines from the registry contracts.
 *
 * Supports both wallet and transaction registries with variant-specific return types.
 * Chain-aware: Works with both hub and spoke chains.
 */

import { useEffect, useRef } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { getBlockTime } from '@/lib/blocks';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

// ============================================================================
// Wallet Registry Deadlines
// ============================================================================

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
 * Reads deadline information for a registeree from the wallet registry.
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

  // Resolve contract address with built-in error handling
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useContractDeadlines'
  );

  // Get the correct ABI for hub/spoke
  const { abi } = getRegistryMetadata('wallet', registryType);

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    functionName: 'getDeadlines',
    args: registereeAddress ? [registereeAddress] : undefined,
    query: {
      enabled: !!registereeAddress && !!contractAddress,
      refetchInterval,
      staleTime: refetchInterval / 2,
    },
  });

  // Transform the raw array result into a typed object
  // Contract returns: [currentBlock, expiry, start, graceBlocks, deadlineBlock, isExpired]
  let transformedData: DeadlineData | undefined;
  if (result.data && result.data.length === 6) {
    const data: DeadlineData = {
      currentBlock: BigInt(result.data[0]),
      expiry: BigInt(result.data[1]),
      start: BigInt(result.data[2]),
      graceBlocks: BigInt(result.data[3]),
      deadlineBlock: BigInt(result.data[4]),
      isExpired: Boolean(result.data[5]),
    };
    transformedData = data;

    // Log deadline data for debugging grace period timer
    const blocksUntilStart = data.start - data.currentBlock;
    logger.contract.debug('getDeadlines response (wallet)', {
      registeree: registereeAddress,
      currentBlock: data.currentBlock.toString(),
      start: data.start.toString(),
      expiry: data.expiry.toString(),
      graceBlocks: data.graceBlocks.toString(),
      deadlineBlock: data.deadlineBlock.toString(),
      isExpired: data.isExpired,
      blocksUntilStart: blocksUntilStart.toString(),
      windowAlreadyOpen: blocksUntilStart <= 0n,
    });
  } else if (result.data) {
    logger.contract.error('Unexpected getDeadlines result structure', {
      dataLength: result.data.length,
      data: result.data,
    });
  }

  return {
    data: transformedData,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

// ============================================================================
// Transaction Registry Deadlines
// ============================================================================

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

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTxContractDeadlines'
  );

  // Get the correct ABI for hub/spoke
  const { abi } = getRegistryMetadata('transaction', registryType);

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
    abi,
    functionName: 'getDeadlines',
    args: reporter ? [reporter] : undefined,
    chainId,
    query: {
      enabled,
      staleTime: 3_000,
      refetchInterval: 3_000, // Poll every 3 seconds for countdown
    },
  });

  // Track previous log key to avoid duplicate logs
  const prevLogKeyRef = useRef<string | null>(null);

  // Log results in effect to avoid render-time side effects
  useEffect(() => {
    if (isError) {
      logger.contract.error('Failed to read deadlines from transaction registry', {
        chainId,
        contractAddress,
        reporter,
        error: error?.message,
      });
    } else if (contractData) {
      // Create a key to detect changes and avoid duplicate logs
      const logKey = `${reporter}-${contractData[0]?.toString()}`;
      if (logKey !== prevLogKeyRef.current) {
        prevLogKeyRef.current = logKey;
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
    }
  }, [isError, contractData, chainId, contractAddress, reporter, error?.message]);

  // Map contract result to TxDeadlineData
  // getDeadlines returns: (currentBlock, expiryBlock, startBlock, graceStartsAt, timeLeft, isExpired)
  // Note: Contract returns uint32 (mapped to number by viem), convert to bigint for interface
  let data: TxDeadlineData | undefined;

  if (contractData) {
    // Validate tuple shape before BigInt conversions to avoid runtime exceptions
    if (
      !Array.isArray(contractData) ||
      contractData.length < 6 ||
      contractData[0] === undefined ||
      contractData[1] === undefined ||
      contractData[2] === undefined ||
      contractData[3] === undefined ||
      contractData[4] === undefined ||
      contractData[5] === undefined
    ) {
      logger.contract.error('useTxContractDeadlines: Invalid contractData shape', {
        isArray: Array.isArray(contractData),
        length: Array.isArray(contractData) ? contractData.length : 'N/A',
        contractData,
        reporter,
        chainId,
      });
    } else {
      data = {
        currentBlock: BigInt(contractData[0]),
        expiry: BigInt(contractData[1]),
        start: BigInt(contractData[2]),
        graceStartsAt: BigInt(contractData[3]),
        timeLeft: BigInt(contractData[4]),
        isExpired: Boolean(contractData[5]),
      };
    }
  }

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
  };
}

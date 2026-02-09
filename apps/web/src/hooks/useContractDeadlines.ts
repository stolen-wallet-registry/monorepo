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
import { walletRegistryAbi, transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

/** Return type from getDeadlines — identical shape on hub and spoke contracts */
type DeadlinesTuple = readonly [bigint, bigint, bigint, bigint, bigint, boolean];

// ============================================================================
// Wallet Registry Deadlines
// ============================================================================

export interface DeadlineData {
  currentBlock: bigint;
  expiry: bigint;
  start: bigint;
  /** Block number when grace period started (rawData[3]) */
  graceStartsAt: bigint;
  /** Blocks remaining until window opens (rawData[4]) */
  timeLeft: bigint;
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

  const isSpoke = registryType === 'spoke';
  const addr = registereeAddress;
  const enabled = !!addr && !!contractAddress;

  // Split-call: one hook per ABI, only one fires based on registryType
  const hubResult = useReadContract({
    address: contractAddress,
    abi: walletRegistryAbi,
    chainId,
    functionName: 'getDeadlines',
    args: addr ? [addr] : undefined,
    query: {
      enabled: !isSpoke && enabled,
      refetchInterval,
      staleTime: refetchInterval / 2,
    },
  });

  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    chainId,
    functionName: 'getDeadlines',
    args: addr ? [addr] : undefined,
    query: {
      enabled: isSpoke && enabled,
      refetchInterval,
      staleTime: refetchInterval / 2,
    },
  });

  const result = isSpoke ? spokeResult : hubResult;

  // Transform the raw result into a typed object
  // Unified format: (currentBlock, expiryBlock, startBlock, graceStartsAt, timeLeft, isExpired)
  let transformedData: DeadlineData | undefined;
  if (result.data) {
    const rawData = result.data as DeadlinesTuple;
    if (rawData.length >= 6) {
      transformedData = {
        currentBlock: BigInt(rawData[0]),
        expiry: BigInt(rawData[1]),
        start: BigInt(rawData[2]),
        graceStartsAt: BigInt(rawData[3]),
        timeLeft: BigInt(rawData[4]),
        isExpired: Boolean(rawData[5]),
      };

      logger.contract.debug('getDeadlines response (wallet)', {
        registeree: registereeAddress,
        currentBlock: rawData[0].toString(),
        expiryBlock: rawData[1].toString(),
        startBlock: rawData[2].toString(),
        isExpired: rawData[5],
      });
    } else {
      logger.contract.error('Unexpected getDeadlines result structure', {
        dataLength: Array.isArray(rawData) ? rawData.length : 'unknown',
        data: rawData,
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

  const isSpoke = registryType === 'spoke';
  const enabled = !!reporter && !!contractAddress;

  // Split-call: one hook per ABI, only one fires based on registryType
  const hubResult = useReadContract({
    address: contractAddress,
    abi: transactionRegistryAbi,
    functionName: 'getDeadlines',
    args: reporter ? [reporter] : undefined,
    chainId,
    query: {
      enabled: !isSpoke && enabled,
      staleTime: 3_000,
      refetchInterval: 3_000,
    },
  });

  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    functionName: 'getDeadlines',
    args: reporter ? [reporter] : undefined,
    chainId,
    query: {
      enabled: isSpoke && enabled,
      staleTime: 3_000,
      refetchInterval: 3_000,
    },
  });

  const { isLoading, isError, error, refetch } = isSpoke ? spokeResult : hubResult;

  // Extract typed data from the active hook (avoids union-type complications)
  const hubDeadlines = hubResult.data as DeadlinesTuple | undefined;
  const spokeDeadlines = spokeResult.data as DeadlinesTuple | undefined;
  const rawDeadlines = isSpoke ? spokeDeadlines : hubDeadlines;

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
    } else if (rawDeadlines) {
      const logKey = `${reporter}-${rawDeadlines[0]?.toString()}`;
      if (logKey !== prevLogKeyRef.current) {
        prevLogKeyRef.current = logKey;
        logger.contract.debug('Transaction registry deadlines read', {
          reporter,
          currentBlock: rawDeadlines[0]?.toString(),
          expiryBlock: rawDeadlines[1]?.toString(),
          startBlock: rawDeadlines[2]?.toString(),
          graceStartsAt: rawDeadlines[3]?.toString(),
          timeLeft: rawDeadlines[4]?.toString(),
          isExpired: rawDeadlines[5],
        });
      }
    }
  }, [isError, rawDeadlines, chainId, contractAddress, reporter, error?.message]);

  // Map contract result to TxDeadlineData
  // Returns: (currentBlock, expiryBlock, startBlock, graceStartsAt, timeLeft, isExpired)
  let data: TxDeadlineData | undefined;

  if (rawDeadlines) {
    const raw = rawDeadlines;
    if (raw.length >= 6 && raw[0] !== undefined) {
      data = {
        currentBlock: BigInt(raw[0]),
        expiry: BigInt(raw[1]),
        start: BigInt(raw[2]),
        graceStartsAt: BigInt(raw[3]),
        timeLeft: BigInt(raw[4]),
        isExpired: Boolean(raw[5]),
      };
    } else {
      logger.contract.error('useTxContractDeadlines: Invalid contractData shape', {
        dataLength: rawDeadlines.length,
        reporter,
        chainId,
      });
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

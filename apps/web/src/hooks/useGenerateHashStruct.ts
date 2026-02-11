/**
 * Hook to read deadline and hash struct from the registry contract.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 * The hash struct returned can be used for verification but is typically not needed client-side.
 *
 * Chain-aware: Works with WalletRegistry (hub) and SpokeRegistry (spoke).
 *
 * Contract signature: generateHashStruct(uint64 reportedChainId, uint64 incidentTimestamp, address trustedForwarder, uint8 step)
 */

import { useMemo } from 'react';
import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { walletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import type { SignatureStep } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface HashStructData {
  deadline: bigint;
  hashStruct: Hash;
}

export interface UseGenerateHashStructResult {
  data: HashStructData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: UseReadContractReturnType['refetch'];
}

/**
 * Reads the deadline and hash struct for signing from the contract.
 *
 * @param params - Parameters for hash struct generation
 * @returns The deadline and hash struct for the EIP-712 message
 */
export function useGenerateHashStruct(
  forwarderAddress: Address | undefined,
  step: SignatureStep,
  reportedChainId?: bigint,
  incidentTimestamp?: bigint
): UseGenerateHashStructResult {
  const chainId = useChainId();

  // Stabilize fields - useMemo prevents Date.now() from causing re-renders
  // The timestamp is computed once per mount (when incidentTimestamp is not provided)
  // This ensures the same timestamp is used for the contract call and won't change between renders
  const effectiveReportedChainId = useMemo(
    () => reportedChainId ?? BigInt(chainId),
    [reportedChainId, chainId]
  );
  const effectiveIncidentTimestamp = useMemo(
    () => incidentTimestamp ?? 0n, // TODO: Add incident timestamp selection UI
    [incidentTimestamp]
  );

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useGenerateHashStruct'
  );

  const isSpoke = registryType === 'spoke';
  const abi = isSpoke ? spokeRegistryAbi : walletRegistryAbi;

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId, // Explicit chain ID ensures RPC call targets correct chain
    functionName: 'generateHashStruct',
    // Contract signature: (uint64 reportedChainId, uint64 incidentTimestamp, address trustedForwarder, uint8 step)
    args: forwarderAddress
      ? [effectiveReportedChainId, effectiveIncidentTimestamp, forwarderAddress, step]
      : undefined,
    query: {
      enabled: !!forwarderAddress && !!contractAddress,
      // Deadline changes with each block, but we don't need real-time updates
      // User will fetch fresh when they click "sign"
      staleTime: 10_000, // 10 seconds
    },
  });

  // Log contract read result for debugging
  if (result.isError) {
    logger.contract.error('generateHashStruct call failed', {
      chainId,
      contractAddress,
      registryType,
      forwarderAddress,
      step,
      error: result.error?.message,
    });
  } else if (result.data) {
    logger.contract.debug('generateHashStruct call succeeded', {
      chainId,
      contractAddress,
      deadline: result.data[0]?.toString(),
    });
  }

  // Transform the raw array result into a typed object
  // The ABI returns bytes32 which wagmi infers as string, but we know it's a hex hash
  const transformedData: HashStructData | undefined = result.data
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

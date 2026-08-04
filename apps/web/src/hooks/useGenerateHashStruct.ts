/**
 * Hook to read the signing deadline from the registry contract.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 *
 * The contract deliberately returns ONLY a deadline — no hash struct. The registration typehash
 * commits to `windowBlockHash`, which is not knowable at this point in the flow (the window block
 * is resolved later, at signing time), so any digest the contract could build here would be
 * missing a member its own typehash declares. Typed data is built client-side by
 * `packages/signatures`; this call exists for the deadline alone. The contract function was
 * renamed `generateHashStruct` -> `getSignatureDeadline` to match (audit finding A3); this hook
 * keeps its old name only to contain the blast radius of the rename across call sites.
 *
 * Chain-aware: Works with WalletRegistry (hub) and SpokeRegistry (spoke).
 *
 * Contract signature: getSignatureDeadline(uint64 reportedChainId, uint64 incidentTimestamp, address trustedForwarder, uint8 step)
 */

import { useMemo } from 'react';
import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { walletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import type { SignatureStep } from '@/lib/signatures';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface HashStructData {
  deadline: bigint;
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
    functionName: 'getSignatureDeadline',
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
    logger.contract.error('getSignatureDeadline call failed', {
      chainId,
      contractAddress,
      registryType,
      forwarderAddress,
      step,
      error: result.error?.message,
    });
  } else if (result.data) {
    logger.contract.debug('getSignatureDeadline call succeeded', {
      chainId,
      contractAddress,
      deadline: result.data?.toString(),
    });
  }

  // The contract returns a bare uint256 deadline; wrap it so call sites keep a named field.
  const transformedData: HashStructData | undefined =
    result.data !== undefined ? { deadline: result.data } : undefined;

  return {
    data: transformedData,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

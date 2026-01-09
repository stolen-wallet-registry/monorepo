/**
 * Hook to read deadline and hash struct from the registry contract.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 * The hash struct returned can be used for verification but is typically not needed client-side.
 *
 * Chain-aware: Works with both StolenWalletRegistry (hub) and SpokeRegistry (spoke).
 */

import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
import { SIGNATURE_STEP, type SignatureStep } from '@/lib/signatures';
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
 * @param forwarderAddress - The trusted forwarder address (who can submit the tx)
 * @param step - The signature step (1 = Acknowledgement, 2 = Registration)
 * @returns The deadline and hash struct for the EIP-712 message
 */
export function useGenerateHashStruct(
  forwarderAddress: Address | undefined,
  step: SignatureStep
): UseGenerateHashStructResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
    logger.contract.debug('Registry address resolved for hash struct', {
      chainId,
      contractAddress,
      registryType,
      step,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('Failed to resolve registry address for hash struct', {
      chainId,
      step,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Both contracts have identical generateHashStruct() function after normalization
  const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;

  const result = useReadContract({
    address: contractAddress,
    abi,
    functionName: 'generateHashStruct',
    args: forwarderAddress ? [forwarderAddress, step] : undefined,
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

/**
 * Helper to get hash struct for acknowledgement step.
 */
export function useAcknowledgementHashStruct(
  forwarderAddress: Address | undefined
): UseGenerateHashStructResult {
  return useGenerateHashStruct(forwarderAddress, SIGNATURE_STEP.ACKNOWLEDGEMENT);
}

/**
 * Helper to get hash struct for registration step.
 */
export function useRegistrationHashStruct(
  forwarderAddress: Address | undefined
): UseGenerateHashStructResult {
  return useGenerateHashStruct(forwarderAddress, SIGNATURE_STEP.REGISTRATION);
}

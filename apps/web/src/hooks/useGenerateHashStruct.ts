/**
 * Hook to read deadline and hash struct from the StolenWalletRegistry contract.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 * The hash struct returned can be used for verification but is typically not needed client-side.
 */

import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getContractAddress } from '@/lib/contracts/addresses';
import { SIGNATURE_STEP, type SignatureStep } from '@/lib/signatures';

export interface HashStructData {
  deadline: bigint;
  hashStruct: `0x${string}`;
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
  forwarderAddress: `0x${string}` | undefined,
  step: SignatureStep
): UseGenerateHashStructResult {
  const chainId = useChainId();

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  const result = useReadContract({
    address: contractAddress,
    abi: stolenWalletRegistryAbi,
    functionName: 'generateHashStruct',
    args: forwarderAddress ? [forwarderAddress, step] : undefined,
    query: {
      enabled: !!forwarderAddress && !!contractAddress,
      // Deadline changes with each block, but we don't need real-time updates
      // User will fetch fresh when they click "sign"
      staleTime: 10_000, // 10 seconds
    },
  });

  // Transform the raw array result into a typed object
  const transformedData: HashStructData | undefined = result.data
    ? {
        deadline: result.data[0],
        hashStruct: result.data[1],
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
  forwarderAddress: `0x${string}` | undefined
): UseGenerateHashStructResult {
  return useGenerateHashStruct(forwarderAddress, SIGNATURE_STEP.ACKNOWLEDGEMENT);
}

/**
 * Helper to get hash struct for registration step.
 */
export function useRegistrationHashStruct(
  forwarderAddress: `0x${string}` | undefined
): UseGenerateHashStructResult {
  return useGenerateHashStruct(forwarderAddress, SIGNATURE_STEP.REGISTRATION);
}

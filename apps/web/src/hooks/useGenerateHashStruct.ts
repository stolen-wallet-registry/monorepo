/**
 * Hook to read deadline and hash struct from the registry contract.
 *
 * This is used before signing to get the contract-generated deadline for the EIP-712 message.
 * The hash struct returned can be used for verification but is typically not needed client-side.
 *
 * Chain-aware: Works with both StolenWalletRegistry (hub) and SpokeRegistry (spoke).
 */

import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
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
 * @param forwarderAddress - The trusted forwarder address (who can submit the tx)
 * @param step - The signature step (1 = Acknowledgement, 2 = Registration)
 * @returns The deadline and hash struct for the EIP-712 message
 */
export function useGenerateHashStruct(
  forwarderAddress: Address | undefined,
  step: SignatureStep
): UseGenerateHashStructResult {
  const chainId = useChainId();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useGenerateHashStruct'
  );

  // Get the correct ABI for hub/spoke
  const { abi } = getRegistryMetadata('wallet', registryType);

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId, // Explicit chain ID ensures RPC call targets correct chain
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

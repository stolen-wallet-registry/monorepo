/**
 * Hook for signing EIP-712 typed data for the StolenWalletRegistry.
 *
 * Provides convenient wrappers around wagmi's useSignTypedData for:
 * - Acknowledgement signatures (Phase 1)
 * - Registration signatures (Phase 2)
 */

import { useSignTypedData, useAccount, useChainId } from 'wagmi';
import {
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  type AcknowledgementMessage,
  type RegistrationMessage,
} from '@/lib/signatures';
import { getContractAddress } from '@/lib/contracts/addresses';

export interface SignParams {
  owner: `0x${string}`;
  forwarder: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
}

/**
 * Converts SignParams to the base message structure used by both
 * acknowledgement and registration messages.
 */
function toBaseMessage(params: SignParams) {
  return {
    owner: params.owner,
    forwarder: params.forwarder,
    nonce: params.nonce,
    deadline: params.deadline,
  };
}

export interface UseSignEIP712Result {
  signAcknowledgement: (params: SignParams) => Promise<`0x${string}`>;
  signRegistration: (params: SignParams) => Promise<`0x${string}`>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for signing EIP-712 messages for the registration flow.
 *
 * @returns Functions for signing acknowledgement and registration messages
 */
export function useSignEIP712(): UseSignEIP712Result {
  const { address } = useAccount();
  const chainId = useChainId();

  const { signTypedDataAsync, isPending, isError, error, reset } = useSignTypedData();

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  /**
   * Validates that wallet is connected and contract is configured.
   * @throws Error if validation fails
   * @returns The validated contract address
   */
  const validateSigningPreconditions = (): `0x${string}` => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    if (!contractAddress) {
      throw new Error('Contract not configured for this chain');
    }
    return contractAddress;
  };

  /**
   * Sign an acknowledgement message (Phase 1).
   */
  const signAcknowledgement = async (params: SignParams): Promise<`0x${string}`> => {
    const validatedAddress = validateSigningPreconditions();
    const message: AcknowledgementMessage = toBaseMessage(params);
    const typedData = buildAcknowledgementTypedData(chainId, validatedAddress, message);

    const signature = await signTypedDataAsync({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    return signature;
  };

  /**
   * Sign a registration message (Phase 2).
   */
  const signRegistration = async (params: SignParams): Promise<`0x${string}`> => {
    const validatedAddress = validateSigningPreconditions();
    const message: RegistrationMessage = toBaseMessage(params);
    const typedData = buildRegistrationTypedData(chainId, validatedAddress, message);

    const signature = await signTypedDataAsync({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    return signature;
  };

  return {
    signAcknowledgement,
    signRegistration,
    isPending,
    isError,
    error,
    reset,
  };
}

/**
 * Hook for signing EIP-712 typed data for the StolenWalletRegistry.
 *
 * Provides convenient wrappers around wagmi's useSignTypedData for:
 * - Acknowledgement signatures (Phase 1)
 * - Registration signatures (Phase 2)
 */

import { useSignTypedData, useAccount, useChainId } from 'wagmi';
import { buildAcknowledgementTypedData, buildRegistrationTypedData } from '@/lib/signatures';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import type { Address, Hex } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface SignParams {
  owner: Address;
  forwarder: Address;
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
  signAcknowledgement: (params: SignParams) => Promise<Hex>;
  signRegistration: (params: SignParams) => Promise<Hex>;
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

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress } = resolveRegistryContract(chainId, 'wallet', 'useSignEIP712');

  /**
   * Validates that wallet is connected and contract is configured.
   * @throws Error if validation fails
   * @returns The validated contract address
   */
  const validateSigningPreconditions = (): Address => {
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
   * Note: The builder adds the statement field internally.
   */
  const signAcknowledgement = async (params: SignParams): Promise<Hex> => {
    const validatedAddress = validateSigningPreconditions();
    const message = toBaseMessage(params);
    const typedData = buildAcknowledgementTypedData(chainId, validatedAddress, message);

    logger.signature.info('Requesting acknowledgement signature', {
      chainId,
      contractAddress: validatedAddress,
      owner: params.owner,
      forwarder: params.forwarder,
      nonce: params.nonce.toString(),
      deadline: params.deadline.toString(),
    });

    try {
      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      logger.signature.info('Acknowledgement signature received', {
        signatureLength: signature.length,
        owner: params.owner,
      });

      return signature;
    } catch (error) {
      logger.signature.error('Acknowledgement signature failed', {
        chainId,
        owner: params.owner,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  /**
   * Sign a registration message (Phase 2).
   */
  const signRegistration = async (params: SignParams): Promise<Hex> => {
    const validatedAddress = validateSigningPreconditions();
    const message = toBaseMessage(params);
    const typedData = buildRegistrationTypedData(chainId, validatedAddress, message);

    logger.signature.info('Requesting registration signature', {
      chainId,
      contractAddress: validatedAddress,
      owner: params.owner,
      forwarder: params.forwarder,
      nonce: params.nonce.toString(),
      deadline: params.deadline.toString(),
    });

    try {
      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      logger.signature.info('Registration signature received', {
        signatureLength: signature.length,
        owner: params.owner,
      });

      return signature;
    } catch (error) {
      logger.signature.error('Registration signature failed', {
        chainId,
        owner: params.owner,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

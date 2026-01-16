/**
 * Hook for signing EIP-712 typed data for the StolenTransactionRegistry.
 *
 * Provides convenient wrappers around wagmi's useSignTypedData for:
 * - Acknowledgement signatures (Phase 1)
 * - Registration signatures (Phase 2)
 */

import { useSignTypedData, useAccount, useChainId } from 'wagmi';
import {
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
} from '@/lib/signatures/transactions';
import { getStolenTransactionRegistryAddress } from '@/lib/contracts/addresses';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxSignAckParams {
  merkleRoot: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

export interface TxSignRegParams {
  merkleRoot: Hash;
  reportedChainId: Hash;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

export interface UseSignTxEIP712Result {
  signTxAcknowledgement: (params: TxSignAckParams) => Promise<Hex>;
  signTxRegistration: (params: TxSignRegParams) => Promise<Hex>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for signing EIP-712 messages for the transaction batch registration flow.
 *
 * @returns Functions for signing acknowledgement and registration messages
 */
export function useSignTxEIP712(): UseSignTxEIP712Result {
  const { address } = useAccount();
  const chainId = useChainId();

  const { signTypedDataAsync, isPending, isError, error, reset } = useSignTypedData();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getStolenTransactionRegistryAddress(chainId);
    logger.signature.debug('useSignTxEIP712: Transaction registry address resolved', {
      chainId,
      contractAddress,
    });
  } catch (err) {
    contractAddress = undefined;
    logger.signature.error('useSignTxEIP712: Failed to resolve transaction registry address', {
      chainId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
   * Sign a transaction batch acknowledgement message (Phase 1).
   */
  const signTxAcknowledgement = async (params: TxSignAckParams): Promise<Hex> => {
    const validatedAddress = validateSigningPreconditions();
    const message: TxAcknowledgementMessage = {
      merkleRoot: params.merkleRoot,
      reportedChainId: params.reportedChainId,
      transactionCount: params.transactionCount,
      forwarder: params.forwarder,
      nonce: params.nonce,
      deadline: params.deadline,
    };
    const typedData = buildTxAcknowledgementTypedData(chainId, validatedAddress, message);

    logger.signature.info('Requesting transaction batch acknowledgement signature', {
      chainId,
      contractAddress: validatedAddress,
      merkleRoot: params.merkleRoot,
      transactionCount: params.transactionCount,
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

      logger.signature.info('Transaction batch acknowledgement signature received', {
        signatureLength: signature.length,
        merkleRoot: params.merkleRoot,
      });

      return signature;
    } catch (err) {
      logger.signature.error('Transaction batch acknowledgement signature failed', {
        chainId,
        merkleRoot: params.merkleRoot,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  /**
   * Sign a transaction batch registration message (Phase 2).
   */
  const signTxRegistration = async (params: TxSignRegParams): Promise<Hex> => {
    const validatedAddress = validateSigningPreconditions();
    const message: TxRegistrationMessage = {
      merkleRoot: params.merkleRoot,
      reportedChainId: params.reportedChainId,
      forwarder: params.forwarder,
      nonce: params.nonce,
      deadline: params.deadline,
    };
    const typedData = buildTxRegistrationTypedData(chainId, validatedAddress, message);

    logger.signature.info('Requesting transaction batch registration signature', {
      chainId,
      contractAddress: validatedAddress,
      merkleRoot: params.merkleRoot,
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

      logger.signature.info('Transaction batch registration signature received', {
        signatureLength: signature.length,
        merkleRoot: params.merkleRoot,
      });

      return signature;
    } catch (err) {
      logger.signature.error('Transaction batch registration signature failed', {
        chainId,
        merkleRoot: params.merkleRoot,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  return {
    signTxAcknowledgement,
    signTxRegistration,
    isPending,
    isError,
    error,
    reset,
  };
}

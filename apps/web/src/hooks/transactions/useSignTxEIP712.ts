/**
 * Hook for signing EIP-712 typed data for the V2 transaction registry.
 * Supports both hub (TransactionRegistryV2) and spoke (SpokeRegistryV2) chains.
 *
 * V2 changes from V1:
 * - `reporter` is an explicit field in the typed data
 * - `merkleRoot` replaced by `dataHash` (keccak256(abi.encode(txHashes, chainIds)))
 * - `transactionCount` present in both ACK and REG types
 * - Domain name unified to "StolenWalletRegistry" across all registries
 */

import { useCallback } from 'react';
import { useSignTypedData, useAccount, useChainId } from 'wagmi';
import {
  buildV2TxAcknowledgementTypedData,
  buildV2TxRegistrationTypedData,
} from '@/lib/signatures/transactions';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface TxSignAckParams {
  /** Reporter address (signer) */
  reporter: Address;
  /** Data hash: keccak256(abi.encodePacked(txHashes, chainIds)) */
  dataHash: Hash;
  /** CAIP-2 chain ID as bytes32 */
  reportedChainId: Hash;
  /** Number of transactions in the batch */
  transactionCount: number;
  /** Trusted forwarder address */
  forwarder: Address;
  /** Contract nonce for reporter */
  nonce: bigint;
  /** Signature deadline (timestamp) */
  deadline: bigint;
}

export interface TxSignRegParams {
  /** Reporter address (signer) */
  reporter: Address;
  /** Data hash: keccak256(abi.encodePacked(txHashes, chainIds)) */
  dataHash: Hash;
  /** CAIP-2 chain ID as bytes32 */
  reportedChainId: Hash;
  /** Number of transactions in the batch */
  transactionCount: number;
  /** Trusted forwarder address */
  forwarder: Address;
  /** Contract nonce for reporter */
  nonce: bigint;
  /** Signature deadline (timestamp) */
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
 * Hook for signing EIP-712 messages for the V2 transaction batch registration flow.
 *
 * @returns Functions for signing acknowledgement and registration messages
 */
export function useSignTxEIP712(): UseSignTxEIP712Result {
  const { address } = useAccount();
  const chainId = useChainId();

  const { signTypedDataAsync, isPending, isError, error, reset } = useSignTypedData();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useSignTxEIP712'
  );
  const isHub = registryType === 'hub';

  /**
   * Validates that wallet is connected, contract is configured, and reporter matches signer.
   * @throws Error if validation fails
   * @returns The validated contract address
   */
  const validateSigningPreconditions = useCallback(
    (reporter?: Address): Address => {
      if (!address) {
        throw new Error('Wallet not connected');
      }
      if (!contractAddress) {
        throw new Error('Contract not configured for this chain');
      }
      if (reporter && reporter.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `Connected wallet ${address} does not match reporter ${reporter}. Please switch wallets.`
        );
      }
      return contractAddress;
    },
    [address, contractAddress]
  );

  /**
   * Sign a transaction batch acknowledgement message (Phase 1).
   */
  const signTxAcknowledgement = useCallback(
    async (params: TxSignAckParams): Promise<Hex> => {
      const validatedAddress = validateSigningPreconditions(params.reporter);
      const message = {
        reporter: params.reporter,
        forwarder: params.forwarder,
        dataHash: params.dataHash,
        reportedChainId: params.reportedChainId,
        transactionCount: params.transactionCount,
        nonce: params.nonce,
        deadline: params.deadline,
      };
      const typedData = buildV2TxAcknowledgementTypedData(
        chainId,
        validatedAddress,
        isHub,
        message
      );

      logger.signature.info('Requesting V2 transaction batch acknowledgement signature', {
        chainId,
        contractAddress: validatedAddress,
        isHub,
        reporter: params.reporter,
        dataHash: params.dataHash,
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

        logger.signature.info('V2 transaction batch acknowledgement signature received', {
          signatureLength: signature.length,
          dataHash: params.dataHash,
        });

        return signature;
      } catch (err) {
        logger.signature.error('V2 transaction batch acknowledgement signature failed', {
          chainId,
          dataHash: params.dataHash,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    [chainId, isHub, signTypedDataAsync, validateSigningPreconditions]
  );

  /**
   * Sign a transaction batch registration message (Phase 2).
   */
  const signTxRegistration = useCallback(
    async (params: TxSignRegParams): Promise<Hex> => {
      const validatedAddress = validateSigningPreconditions(params.reporter);
      const message = {
        reporter: params.reporter,
        forwarder: params.forwarder,
        dataHash: params.dataHash,
        reportedChainId: params.reportedChainId,
        transactionCount: params.transactionCount,
        nonce: params.nonce,
        deadline: params.deadline,
      };
      const typedData = buildV2TxRegistrationTypedData(chainId, validatedAddress, isHub, message);

      logger.signature.info('Requesting V2 transaction batch registration signature', {
        chainId,
        contractAddress: validatedAddress,
        isHub,
        reporter: params.reporter,
        dataHash: params.dataHash,
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

        logger.signature.info('V2 transaction batch registration signature received', {
          signatureLength: signature.length,
          dataHash: params.dataHash,
        });

        return signature;
      } catch (err) {
        logger.signature.error('V2 transaction batch registration signature failed', {
          chainId,
          dataHash: params.dataHash,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    [chainId, isHub, signTypedDataAsync, validateSigningPreconditions]
  );

  return {
    signTxAcknowledgement,
    signTxRegistration,
    isPending,
    isError,
    error,
    reset,
  };
}

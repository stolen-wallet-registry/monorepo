/**
 * Hook for signing EIP-712 typed data for the registry contracts.
 *
 * Provides convenient wrappers around wagmi's useSignTypedData for:
 * - Acknowledgement signatures (Phase 1)
 * - Registration signatures (Phase 2)
 *
 * Key details:
 * - `wallet` field in signatures identifies the wallet being registered
 * - Fields: `reportedChainId` (uint64 raw EVM chain ID) and `incidentTimestamp` (uint64)
 * - Different EIP-712 domain names for Hub vs Spoke
 *
 * ## Security Model
 *
 * - **Wallet validation**: Ensures connected wallet matches the signing wallet (users can only
 *   sign for wallets they control). This is a UX guard; contract also validates signature.
 * - **Field validation**: reportedChainId and incidentTimestamp are passed through without
 *   client-side validation. Contract-side validation is authoritative. Invalid values will
 *   cause contract revert, not silent failures.
 * - **Signature verification**: Contract verifies EIP-712 signature matches the message fields.
 *   Any tampering between signing and submission will be detected and rejected.
 */

import { useSignTypedData, useAccount, useChainId } from 'wagmi';
import { buildAcknowledgementTypedData, buildRegistrationTypedData } from '@/lib/signatures';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import type { Address, Hex } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface SignParams {
  /** The wallet address being registered */
  wallet: Address;
  /** The trusted forwarder who can submit the transaction */
  trustedForwarder: Address;
  /** Raw EVM chain ID where incident occurred (e.g., 1 for mainnet, 8453 for Base) */
  reportedChainId: bigint;
  /** Unix timestamp when the incident occurred */
  incidentTimestamp: bigint;
  /** Nonce for replay protection */
  nonce: bigint;
  /** Signature deadline (timestamp) */
  deadline: bigint;
}

/**
 * Converts SignParams to the message structure (without statement).
 */
function toMessage(params: SignParams) {
  return {
    wallet: params.wallet,
    trustedForwarder: params.trustedForwarder,
    reportedChainId: params.reportedChainId,
    incidentTimestamp: params.incidentTimestamp,
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

  // Resolve contract address and determine if hub or spoke
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useSignEIP712'
  );
  const isHub = registryType === 'hub';

  /**
   * Validates that wallet is connected, contract is configured, and signer matches.
   * @param wallet The wallet address that should be signing
   * @throws Error if validation fails
   * @returns The validated contract address
   */
  const validateSigningPreconditions = (wallet: Address): Address => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    // Ensure the connected wallet is the one being registered (must sign with their own wallet)
    if (address.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error(
        `Connected wallet (${address}) does not match signing wallet (${wallet}). Please switch to the wallet you want to register.`
      );
    }
    if (!contractAddress) {
      throw new Error('Contract not configured for this chain');
    }
    return contractAddress;
  };

  /**
   * Sign an acknowledgement message (Phase 1).
   * Uses typed data with reportedChainId and incidentTimestamp.
   */
  const signAcknowledgement = async (params: SignParams): Promise<Hex> => {
    const validatedAddress = validateSigningPreconditions(params.wallet);
    const message = toMessage(params);
    const typedData = buildAcknowledgementTypedData(chainId, validatedAddress, isHub, message);

    logger.signature.info('Requesting acknowledgement signature', {
      chainId,
      contractAddress: validatedAddress,
      isHub,
      wallet: params.wallet,
      trustedForwarder: params.trustedForwarder,
      reportedChainId: params.reportedChainId.toString(),
      incidentTimestamp: params.incidentTimestamp.toString(),
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
        wallet: params.wallet,
      });

      return signature;
    } catch (error) {
      logger.signature.error('Acknowledgement signature failed', {
        chainId,
        wallet: params.wallet,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  /**
   * Sign a registration message (Phase 2).
   * Uses typed data with reportedChainId and incidentTimestamp.
   */
  const signRegistration = async (params: SignParams): Promise<Hex> => {
    const validatedAddress = validateSigningPreconditions(params.wallet);
    const message = toMessage(params);
    const typedData = buildRegistrationTypedData(chainId, validatedAddress, isHub, message);

    logger.signature.info('Requesting registration signature', {
      chainId,
      contractAddress: validatedAddress,
      isHub,
      wallet: params.wallet,
      trustedForwarder: params.trustedForwarder,
      reportedChainId: params.reportedChainId.toString(),
      incidentTimestamp: params.incidentTimestamp.toString(),
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
        wallet: params.wallet,
      });

      return signature;
    } catch (error) {
      logger.signature.error('Registration signature failed', {
        chainId,
        wallet: params.wallet,
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

/**
 * Hook to submit a registration transaction to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow.
 * Must be called after the grace period has elapsed following acknowledgement.
 *
 * V2 unified signature (both hub and spoke):
 *   register(wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
 *
 * Note: reportedChainId is the raw EVM chain ID (1, 8453, etc.), not a hash.
 * The contract internally converts to CAIP-2 hash for storage.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import type { ParsedSignature, WalletRegistrationArgs } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface RegistrationParams {
  deadline: bigint;
  nonce: bigint;
  /** The wallet address being registered as stolen */
  registeree: Address;
  signature: ParsedSignature;
  /**
   * V2: Raw EVM chain ID where incident occurred (e.g., 1 for mainnet, 8453 for Base).
   * Contract internally converts to CAIP-2 hash for storage.
   */
  reportedChainId: bigint;
  /** V2: Unix timestamp when incident occurred */
  incidentTimestamp: bigint;
  /** Protocol fee to send with the registration transaction (from useFeeEstimate) */
  feeWei?: bigint;
}

export interface UseRegistrationResult {
  submitRegistration: (params: RegistrationParams) => Promise<Hash>;
  hash: Hash | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for submitting registration transactions.
 * Chain-aware: automatically selects correct contract and function.
 *
 * @returns Functions and state for registration submission
 */
export function useRegistration(): UseRegistrationResult {
  const chainId = useChainId();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useRegistration'
  );

  // Get the correct ABI and function names for hub/spoke
  const { abi, functions } = getRegistryMetadata('wallet', registryType);

  const {
    writeContractAsync,
    data: hash,
    isPending,
    isError: isWriteError,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const submitRegistration = async (params: RegistrationParams): Promise<Hash> => {
    if (!contractAddress) {
      logger.contract.error('useRegistration: No contract address configured', { chainId });
      throw new Error('Contract not configured for this chain');
    }

    const { deadline, nonce, registeree, signature, reportedChainId, incidentTimestamp, feeWei } =
      params;

    // Use metadata for correct function name based on chain type
    const functionName = functions.register;

    if (!functionName) {
      logger.contract.error('useRegistration: Missing register function in metadata', {
        chainId,
        registryType,
      });
      throw new Error('Registration function not configured for this registry type');
    }

    logger.registration.info('Submitting V2 registration transaction', {
      chainId,
      registryType,
      contractAddress,
      functionName,
      registeree,
      reportedChainId: reportedChainId.toString(),
      incidentTimestamp: incidentTimestamp.toString(),
      deadline: deadline.toString(),
      nonce: nonce.toString(),
      feeWei: feeWei?.toString() ?? '0',
    });

    try {
      // V2 unified signature for both hub and spoke:
      // (wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
      const args: WalletRegistrationArgs = [
        registeree,
        reportedChainId,
        incidentTimestamp,
        deadline,
        nonce,
        signature.v,
        signature.r,
        signature.s,
      ];

      // Cast to any for value since wagmi's strict typing with union ABIs
      // incorrectly infers value as undefined for some ABI function combinations
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: functionName as 'register' | 'registerLocal',
        args,
        value: feeWei ?? 0n,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      logger.registration.info('V2 registration transaction submitted', {
        txHash,
        registeree,
        chainId,
        registryType,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('V2 registration transaction failed', {
        chainId,
        registeree,
        registryType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    submitRegistration,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
  };
}

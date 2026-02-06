/**
 * Hook to submit a registration transaction to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow.
 * Must be called after the grace period has elapsed following acknowledgement.
 *
 * WalletRegistry signature:
 *   register(registeree, deadline, reportedChainId, incidentTimestamp, v, r, s)
 *
 * @note reportedChainId is uint64 raw EVM chain ID. Contract converts to CAIP-2 hash internally.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface RegistrationParams {
  /** The wallet address being registered as stolen */
  registeree: Address;
  /** Signature deadline (timestamp) */
  deadline: bigint;
  /** Raw EVM chain ID where incident occurred (uint64) — must match acknowledge phase */
  reportedChainId: bigint;
  /** Unix timestamp when incident occurred — must match acknowledge phase */
  incidentTimestamp: bigint;
  /** EIP-712 signature */
  signature: ParsedSignature;
  /** Protocol fee to send with the registration transaction */
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

    const { registeree, deadline, reportedChainId, incidentTimestamp, signature, feeWei } = params;

    // Use metadata for correct function name based on chain type
    const functionName = functions.register;

    if (!functionName) {
      logger.contract.error('useRegistration: Missing register function in metadata', {
        chainId,
        registryType,
      });
      throw new Error('Registration function not configured for this registry type');
    }

    logger.registration.info('Submitting registration transaction', {
      chainId,
      registryType,
      contractAddress,
      functionName,
      registeree,
      reportedChainId,
      incidentTimestamp: incidentTimestamp.toString(),
      deadline: deadline.toString(),
      feeWei: feeWei?.toString() ?? '0',
    });

    try {
      // WalletRegistry: register(registeree, deadline, reportedChainId, incidentTimestamp, v, r, s)
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: functionName as 'register' | 'registerLocal',
        args: [
          registeree,
          deadline,
          reportedChainId,
          incidentTimestamp,
          signature.v,
          signature.r,
          signature.s,
        ],
        value: feeWei ?? 0n,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      logger.registration.info('Registration transaction submitted', {
        txHash,
        registeree,
        chainId,
        registryType,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('Registration transaction failed', {
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

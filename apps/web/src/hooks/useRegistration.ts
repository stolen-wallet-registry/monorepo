/**
 * Hook to submit a registration transaction to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow.
 * Must be called after the grace period has elapsed following acknowledgement.
 *
 * Chain-aware: Uses StolenWalletRegistry on hub chains, SpokeRegistry on spoke chains.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface RegistrationParams {
  deadline: bigint;
  nonce: bigint;
  /**
   * The wallet address being registered as stolen.
   * Maps to `owner` parameter in the contract ABI.
   */
  registeree: Address;
  signature: ParsedSignature;
  /**
   * Protocol fee to send with the registration transaction.
   * Obtained from useFeeEstimate hook.
   */
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

    const { deadline, nonce, registeree, signature, feeWei } = params;

    // Use metadata for correct function name based on chain type
    const functionName = functions.register;

    logger.registration.info('Submitting registration transaction', {
      chainId,
      registryType,
      contractAddress,
      functionName,
      registeree,
      deadline: deadline.toString(),
      nonce: nonce.toString(),
      feeWei: feeWei?.toString() ?? '0',
    });

    try {
      // Cast functionName since wagmi expects specific literal type from ABI
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: functionName as 'register',
        args: [deadline, nonce, registeree, signature.v, signature.r, signature.s],
        value: feeWei ?? 0n,
      });

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

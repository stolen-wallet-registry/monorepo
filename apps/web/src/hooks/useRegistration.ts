/**
 * Hook to submit a registration transaction to the registry contract.
 *
 * This is Phase 2 of the two-phase registration flow.
 * Must be called after the grace period has elapsed following acknowledgement.
 *
 * Chain-aware: Uses StolenWalletRegistry on hub chains, SpokeRegistry on spoke chains.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
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

  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
    logger.contract.debug('useRegistration: Registry address resolved', {
      chainId,
      contractAddress,
      registryType,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useRegistration: Failed to resolve registry address', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

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

    // Select correct ABI and function name based on chain type
    const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;
    const functionName = registryType === 'spoke' ? 'registerLocal' : 'register';

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
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName,
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

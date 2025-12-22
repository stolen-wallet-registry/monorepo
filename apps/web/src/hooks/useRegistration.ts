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
  } catch {
    contractAddress = undefined;
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
      throw new Error('Contract not configured for this chain');
    }

    const { deadline, nonce, registeree, signature, feeWei } = params;

    // Select correct ABI and function name based on chain type
    const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;
    const functionName = registryType === 'spoke' ? 'registerLocal' : 'register';

    const txHash = await writeContractAsync({
      address: contractAddress,
      abi,
      functionName,
      args: [deadline, nonce, registeree, signature.v, signature.r, signature.s],
      value: feeWei ?? 0n,
    });

    return txHash;
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

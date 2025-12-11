/**
 * Hook to submit an acknowledgement transaction to the StolenWalletRegistry contract.
 *
 * This is Phase 1 of the two-phase registration flow.
 * After acknowledgement, a grace period begins before registration can be completed.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getContractAddress } from '@/lib/contracts/addresses';
import type { ParsedSignature } from '@/lib/signatures';

export interface AcknowledgementParams {
  deadline: bigint;
  nonce: bigint;
  registeree: `0x${string}`;
  signature: ParsedSignature;
}

export interface UseAcknowledgementResult {
  submitAcknowledgement: (params: AcknowledgementParams) => Promise<`0x${string}`>;
  hash: `0x${string}` | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for submitting acknowledgement transactions.
 *
 * @returns Functions and state for acknowledgement submission
 */
export function useAcknowledgement(): UseAcknowledgementResult {
  const chainId = useChainId();

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddress(chainId);
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

  const submitAcknowledgement = async (params: AcknowledgementParams): Promise<`0x${string}`> => {
    if (!contractAddress) {
      throw new Error('Contract not configured for this chain');
    }

    const { deadline, nonce, registeree, signature } = params;

    const txHash = await writeContractAsync({
      address: contractAddress,
      abi: stolenWalletRegistryAbi,
      functionName: 'acknowledgementOfRegistry',
      args: [deadline, nonce, registeree, signature.v, signature.r, signature.s],
    });

    return txHash;
  };

  return {
    submitAcknowledgement,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
  };
}

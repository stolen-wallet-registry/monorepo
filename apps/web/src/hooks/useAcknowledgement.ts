/**
 * Hook to submit an acknowledgement transaction to the registry contract.
 *
 * This is Phase 1 of the two-phase registration flow.
 * After acknowledgement, a grace period begins before registration can be completed.
 *
 * Chain-aware: Uses StolenWalletRegistry on hub chains, SpokeRegistry on spoke chains.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';

export interface AcknowledgementParams {
  deadline: bigint;
  nonce: bigint;
  /**
   * The wallet address being registered as stolen.
   * Maps to `owner` parameter in the contract ABI.
   */
  registeree: Address;
  signature: ParsedSignature;
  /**
   * Protocol fee to send with the acknowledgement transaction.
   * Obtained from useFeeEstimate hook.
   */
  feeWei?: bigint;
}

export interface UseAcknowledgementResult {
  submitAcknowledgement: (params: AcknowledgementParams) => Promise<Hash>;
  hash: Hash | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for submitting acknowledgement transactions.
 * Chain-aware: automatically selects correct contract and function.
 *
 * @returns Functions and state for acknowledgement submission
 */
export function useAcknowledgement(): UseAcknowledgementResult {
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

  const submitAcknowledgement = async (params: AcknowledgementParams): Promise<Hash> => {
    if (!contractAddress) {
      throw new Error('Contract not configured for this chain');
    }

    const { deadline, nonce, registeree, signature, feeWei } = params;

    // Select correct ABI and function name based on chain type
    const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;
    const functionName = registryType === 'spoke' ? 'acknowledgeLocal' : 'acknowledge';

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

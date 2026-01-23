/**
 * Hook to submit an acknowledgement transaction to the registry contract.
 *
 * This is Phase 1 of the two-phase registration flow.
 * After acknowledgement, a grace period begins before registration can be completed.
 *
 * Chain-aware: Uses StolenWalletRegistry on hub chains, SpokeRegistry on spoke chains.
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

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

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useAcknowledgement'
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

  const submitAcknowledgement = async (params: AcknowledgementParams): Promise<Hash> => {
    if (!contractAddress) {
      logger.contract.error('useAcknowledgement: No contract address configured', { chainId });
      throw new Error('Contract not configured for this chain');
    }

    const { deadline, nonce, registeree, signature, feeWei } = params;

    // Use metadata for correct ABI and function name based on chain type
    const functionName = functions.acknowledge;

    logger.registration.info('Submitting acknowledgement transaction', {
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
      // Cast to any for value since wagmi's strict typing with union ABIs
      // incorrectly infers value as undefined for some ABI function combinations
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: functionName as 'acknowledge',
        args: [deadline, nonce, registeree, signature.v, signature.r, signature.s],
        value: feeWei ?? 0n,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      logger.registration.info('Acknowledgement transaction submitted', {
        txHash,
        registeree,
        chainId,
        registryType,
      });

      return txHash;
    } catch (error) {
      logger.registration.error('Acknowledgement transaction failed', {
        chainId,
        registeree,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

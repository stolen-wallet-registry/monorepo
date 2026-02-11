/**
 * Hook to submit an acknowledgement transaction to the registry contract.
 *
 * This is Phase 1 of the two-phase registration flow.
 * After acknowledgement, a grace period begins before registration can be completed.
 *
 * Unified signature (hub and spoke):
 *   acknowledge(wallet, trustedForwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
 *
 * isSponsored is derived on-chain as (wallet != trustedForwarder).
 */

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { walletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import type { ParsedSignature } from '@/lib/signatures';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface AcknowledgementParams {
  /** The wallet address being registered as stolen */
  registeree: Address;
  /** The address authorized to complete registration (same as registeree for standard) */
  trustedForwarder: Address;
  /** Raw EVM chain ID where incident occurred (uint64) */
  reportedChainId: bigint;
  /** Unix timestamp when incident occurred */
  incidentTimestamp: bigint;
  /** Signature deadline (timestamp) */
  deadline: bigint;
  /** Nonce for replay protection */
  nonce: bigint;
  /** EIP-712 signature */
  signature: ParsedSignature;
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

  const isSpoke = registryType === 'spoke';

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

    const {
      registeree,
      trustedForwarder,
      reportedChainId,
      incidentTimestamp,
      deadline,
      nonce,
      signature,
    } = params;

    logger.registration.info('Submitting acknowledgement transaction', {
      chainId,
      registryType,
      contractAddress,
      functionName: 'acknowledge',
      registeree,
      trustedForwarder,
      reportedChainId: reportedChainId.toString(),
      incidentTimestamp: incidentTimestamp.toString(),
      deadline: deadline.toString(),
      nonce: nonce.toString(),
    });

    try {
      // Unified: acknowledge(wallet, trustedForwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
      const args = [
        registeree,
        trustedForwarder,
        reportedChainId,
        incidentTimestamp,
        deadline,
        nonce,
        signature.v,
        signature.r,
        signature.s,
      ] as const;

      // Both hub and spoke acknowledge are nonpayable (fees collected at register)
      const abi = isSpoke ? spokeRegistryAbi : walletRegistryAbi;
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: 'acknowledge',
        args,
      });

      logger.registration.info('Acknowledgement transaction submitted', {
        txHash,
        registeree,
        trustedForwarder,
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

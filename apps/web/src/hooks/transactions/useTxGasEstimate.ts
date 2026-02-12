/**
 * Hook to estimate gas costs for transaction batch registration.
 *
 * Uses wagmi's useEstimateGas and useGasPrice to calculate:
 * - Gas units needed for the transaction
 * - Current gas price
 * - Total gas cost in ETH and USD
 *
 * Architecture:
 * - Hub chains: TransactionRegistry (acknowledgeTransactions, registerTransactions)
 * - Spoke chains: SpokeRegistry (acknowledgeTransactionBatch, registerTransactionBatch)
 */

import { useMemo, useEffect, useRef } from 'react';
import { useEstimateGas, useGasPrice, useChainId } from 'wagmi';
import { formatGwei, encodeFunctionData } from 'viem';
import { transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress } from '@/lib/contracts/addresses';
import { getSpokeContractAddress } from '@/lib/contracts/crosschain-addresses';
import { isHubChain, isSpokeChain } from '@swr/chains';
import { useEthPrice } from '@/hooks/useEthPrice';
import { logger } from '@/lib/logger';
import { formatCentsToUsd, formatEthConsistent } from '@/lib/utils';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

export interface TxGasEstimate {
  /** Estimated gas units for the transaction */
  gasUnits: bigint;
  /** Current gas price in wei */
  gasPriceWei: bigint;
  /** Current gas price in gwei (formatted string, e.g., "1.5") */
  gasPriceGwei: string;
  /** Total gas cost in wei (gasUnits * gasPriceWei) */
  gasCostWei: bigint;
  /** Total gas cost in ETH (formatted string, e.g., "0.00015") */
  gasCostEth: string;
  /** Total gas cost in USD (formatted string, e.g., "$0.52") */
  gasCostUsd: string;
}

export interface UseTxGasEstimateParams {
  /** Which step we're estimating for */
  step: 'acknowledgement' | 'registration';
  /** Reporter address */
  reporter?: Address;
  /** Trusted forwarder address (hub only, same as reporter for self-registration) */
  trustedForwarder?: Address;
  /** Data hash (merkle root) - for acknowledgement */
  dataHash?: Hash;
  /** Signature deadline */
  deadline?: bigint;
  /** Signature nonce (spoke only) */
  nonce?: bigint;
  /** Reported chain ID as bytes32 (spoke only) */
  reportedChainId?: Hash;
  /** Transaction count (spoke acknowledgement only) */
  transactionCount?: number;
  /** Transaction hashes in batch - for registration */
  transactionHashes?: Hash[];
  /** Chain IDs for each transaction - for registration */
  chainIds?: Hash[];
  /** Parsed signature components */
  signature?: {
    v: number;
    r: Hex;
    s: Hex;
  };
  /** Value to send with the transaction */
  value?: bigint;
  /** Whether to enable the estimate */
  enabled?: boolean;
}

export interface UseTxGasEstimateResult {
  /** The gas estimate data, or null if loading/error/disabled */
  data: TxGasEstimate | null;
  /** Whether the estimate is currently loading */
  isLoading: boolean;
  /** Whether there was an error estimating gas */
  isError: boolean;
  /** The error object if there was an error */
  error: Error | null;
  /** Function to manually refetch the estimate */
  refetch: () => void;
}

/** Polling interval for gas estimates (15 seconds) */
const GAS_POLL_INTERVAL = 15_000;

/** Gas buffer multiplier (add 20% for safety) */
const GAS_BUFFER_NUMERATOR = 120n;
const GAS_BUFFER_DENOMINATOR = 100n;

/**
 * Hook to estimate gas costs for transaction batch registration.
 */
export function useTxGasEstimate({
  step,
  reporter,
  trustedForwarder,
  dataHash,
  deadline,
  nonce,
  reportedChainId,
  transactionCount,
  transactionHashes,
  chainIds,
  signature,
  value,
  enabled = true,
}: UseTxGasEstimateParams): UseTxGasEstimateResult {
  const chainId = useChainId();
  const ethPrice = useEthPrice();

  const isSpoke = isSpokeChain(chainId);
  const isHub = isHubChain(chainId);

  // Get contract address (may throw for unconfigured chains)
  let contractAddress: Address | undefined;
  try {
    if (isSpoke) {
      contractAddress = getSpokeContractAddress('spokeRegistry', chainId);
    } else if (isHub) {
      contractAddress = getTransactionRegistryAddress(chainId);
    }
  } catch (err) {
    logger.contract.error('useTxGasEstimate: Failed to resolve contract address', {
      chainId,
      isSpoke,
      isHub,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Check if we have all required params based on step and chain type
  const hasHubAckParams =
    isHub &&
    step === 'acknowledgement' &&
    !!reporter &&
    !!trustedForwarder &&
    deadline !== undefined &&
    !!dataHash &&
    !!reportedChainId &&
    transactionCount !== undefined &&
    !!signature;

  const hasSpokeAckParams =
    isSpoke &&
    step === 'acknowledgement' &&
    !!reporter &&
    deadline !== undefined &&
    nonce !== undefined &&
    !!dataHash &&
    !!reportedChainId &&
    transactionCount !== undefined &&
    !!signature;

  const hasHubRegParams =
    isHub &&
    step === 'registration' &&
    !!reporter &&
    deadline !== undefined &&
    !!transactionHashes?.length &&
    !!chainIds?.length &&
    !!signature;

  const hasSpokeRegParams =
    isSpoke &&
    step === 'registration' &&
    !!reporter &&
    deadline !== undefined &&
    nonce !== undefined &&
    !!reportedChainId &&
    !!transactionHashes?.length &&
    !!chainIds?.length &&
    !!signature;

  const hasAllParams = hasHubAckParams || hasSpokeAckParams || hasHubRegParams || hasSpokeRegParams;

  // Build call data for gas estimation
  const callData = useMemo(() => {
    if (!hasAllParams || !signature) {
      return undefined;
    }

    try {
      if (
        hasHubAckParams &&
        reporter &&
        trustedForwarder &&
        deadline !== undefined &&
        dataHash &&
        reportedChainId &&
        transactionCount !== undefined
      ) {
        // Hub: acknowledgeTransactions(reporter, trustedForwarder, deadline, dataHash, reportedChainId, transactionCount, v, r, s)
        return encodeFunctionData({
          abi: transactionRegistryAbi,
          functionName: 'acknowledgeTransactions',
          args: [
            reporter,
            trustedForwarder,
            deadline,
            dataHash,
            reportedChainId,
            transactionCount,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      }

      if (
        hasSpokeAckParams &&
        dataHash &&
        reportedChainId &&
        transactionCount !== undefined &&
        deadline !== undefined &&
        nonce !== undefined &&
        reporter
      ) {
        // Spoke: acknowledgeTransactionBatch(dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s)
        return encodeFunctionData({
          abi: spokeRegistryAbi,
          functionName: 'acknowledgeTransactionBatch',
          args: [
            dataHash,
            reportedChainId,
            transactionCount,
            deadline,
            nonce,
            reporter,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      }

      if (hasHubRegParams && reporter && deadline !== undefined && transactionHashes && chainIds) {
        // Hub: registerTransactions(reporter, deadline, transactionHashes, chainIds, v, r, s)
        return encodeFunctionData({
          abi: transactionRegistryAbi,
          functionName: 'registerTransactions',
          args: [
            reporter,
            deadline,
            transactionHashes,
            chainIds,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      }

      if (
        hasSpokeRegParams &&
        reportedChainId &&
        deadline !== undefined &&
        nonce !== undefined &&
        reporter &&
        transactionHashes &&
        chainIds
      ) {
        // Spoke: registerTransactionBatch(reportedChainId, deadline, nonce, reporter, transactionHashes, chainIds, v, r, s)
        return encodeFunctionData({
          abi: spokeRegistryAbi,
          functionName: 'registerTransactionBatch',
          args: [
            reportedChainId,
            deadline,
            nonce,
            reporter,
            transactionHashes,
            chainIds,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      }

      return undefined;
    } catch (err) {
      logger.contract.debug('Failed to encode function data for gas estimate', {
        step,
        isHub,
        isSpoke,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }, [
    step,
    reporter,
    trustedForwarder,
    dataHash,
    deadline,
    nonce,
    reportedChainId,
    transactionCount,
    transactionHashes,
    chainIds,
    signature,
    hasAllParams,
    hasHubAckParams,
    hasSpokeAckParams,
    hasHubRegParams,
    hasSpokeRegParams,
    isHub,
    isSpoke,
  ]);

  // Previous estimate ref for comparison to reduce log spam
  const prevEstimateRef = useRef<bigint | null>(null);

  // Estimate gas for the transaction
  const gasEstimate = useEstimateGas({
    to: contractAddress,
    data: callData,
    value,
    query: {
      enabled: enabled && !!callData && !!contractAddress,
      staleTime: GAS_POLL_INTERVAL,
      refetchInterval: GAS_POLL_INTERVAL,
    },
  });

  // Get current gas price
  const gasPrice = useGasPrice({
    query: {
      enabled: enabled && !!callData,
      staleTime: GAS_POLL_INTERVAL,
      refetchInterval: GAS_POLL_INTERVAL,
    },
  });

  // Combine results into formatted output
  const data = useMemo<TxGasEstimate | null>(() => {
    if (!gasEstimate.data || !gasPrice.data) {
      return null;
    }

    // Apply gas buffer
    const gasUnits = (gasEstimate.data * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;
    const gasPriceWei = gasPrice.data;
    const gasCostWei = gasUnits * gasPriceWei;

    // Format values
    const gasPriceGwei = formatGwei(gasPriceWei);
    const gasCostEth = formatEthConsistent(gasCostWei);

    // Calculate USD cost
    const ethPriceUsd = ethPrice?.data?.usd;
    const gasCostUsd = ethPriceUsd
      ? formatCentsToUsd(((Number(gasCostWei) * ethPriceUsd) / 1e18) * 100)
      : '—';

    return {
      gasUnits,
      gasPriceWei,
      gasPriceGwei,
      gasCostWei,
      gasCostEth,
      gasCostUsd,
    };
  }, [gasEstimate.data, gasPrice.data, ethPrice?.data?.usd]);

  // Log significant changes in gas estimate
  useEffect(() => {
    if (data?.gasUnits && data.gasUnits !== prevEstimateRef.current) {
      logger.contract.debug('Tx gas estimate updated', {
        step,
        isHub,
        isSpoke,
        gasUnits: data.gasUnits.toString(),
        gasCostEth: data.gasCostEth,
        gasCostUsd: data.gasCostUsd,
      });
      prevEstimateRef.current = data.gasUnits;
    }
  }, [data?.gasUnits, data?.gasCostEth, data?.gasCostUsd, step, isHub, isSpoke]);

  const isLoading = gasEstimate.isLoading || gasPrice.isLoading;
  const isError = gasEstimate.isError || gasPrice.isError;
  const error = gasEstimate.error || gasPrice.error;

  const refetch = () => {
    gasEstimate.refetch();
    gasPrice.refetch();
  };

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
  };
}

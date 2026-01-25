/**
 * Hook to estimate gas costs for transaction batch registration.
 *
 * Uses wagmi's useEstimateGas and useGasPrice to calculate:
 * - Gas units needed for the transaction
 * - Current gas price
 * - Total gas cost in ETH and USD
 *
 * Supports both hub (StolenTransactionRegistry) and spoke (SpokeTransactionRegistry) chains.
 */

import { useMemo, useEffect } from 'react';
import { useEstimateGas, useGasPrice, useChainId } from 'wagmi';
import { formatGwei, encodeFunctionData } from 'viem';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
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
  /** Merkle root of the batch */
  merkleRoot?: Hash;
  /** CAIP-2 chain ID hash */
  reportedChainId?: Hash;
  /** Number of transactions (for acknowledgement) */
  transactionCount?: number;
  /** Transaction hashes in batch */
  transactionHashes?: Hash[];
  /** Chain IDs for each transaction */
  chainIds?: Hash[];
  /** Reporter address */
  reporter?: Address;
  /** Signature deadline */
  deadline?: bigint;
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
  merkleRoot,
  reportedChainId,
  transactionCount,
  transactionHashes,
  chainIds,
  reporter,
  deadline,
  signature,
  value,
  enabled = true,
}: UseTxGasEstimateParams): UseTxGasEstimateResult {
  const chainId = useChainId();
  const ethPrice = useEthPrice();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTxGasEstimate'
  );

  // Get the correct ABI for hub/spoke
  const { abi } = getRegistryMetadata('transaction', registryType);

  // Check if we have all required params
  const hasAllParams =
    !!merkleRoot &&
    !!reportedChainId &&
    !!transactionHashes?.length &&
    !!chainIds?.length &&
    !!reporter &&
    deadline !== undefined &&
    !!signature;

  // Build call data for gas estimation
  // acknowledge: (merkleRoot, reportedChainId, transactionCount, transactionHashes, chainIds, reporter, deadline, v, r, s)
  // register: (merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s)
  const callData = useMemo(() => {
    if (
      !hasAllParams ||
      !merkleRoot ||
      !reportedChainId ||
      !transactionHashes ||
      !chainIds ||
      !reporter ||
      deadline === undefined ||
      !signature
    ) {
      return undefined;
    }

    try {
      if (step === 'acknowledgement') {
        // acknowledge has transactionCount as 3rd param (uint32)
        const txCount = transactionCount ?? transactionHashes.length;
        return encodeFunctionData({
          abi,
          functionName: 'acknowledge',
          args: [
            merkleRoot,
            reportedChainId,
            txCount,
            transactionHashes,
            chainIds,
            reporter,
            deadline,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      } else {
        // register does NOT have transactionCount
        return encodeFunctionData({
          abi,
          functionName: 'register',
          args: [
            merkleRoot,
            reportedChainId,
            transactionHashes,
            chainIds,
            reporter,
            deadline,
            signature.v,
            signature.r,
            signature.s,
          ],
        });
      }
    } catch (err) {
      logger.contract.debug('Failed to encode function data for gas estimate', {
        step,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }, [
    step,
    merkleRoot,
    reportedChainId,
    transactionCount,
    transactionHashes,
    chainIds,
    reporter,
    deadline,
    signature,
    hasAllParams,
    abi,
  ]);

  const estimateEnabled = enabled && !!contractAddress && !!callData;

  // Log when estimation is disabled for debugging (in useEffect to avoid double-invocation in Strict Mode)
  useEffect(() => {
    if (enabled && !estimateEnabled) {
      logger.contract.debug('Gas estimation disabled - missing requirements', {
        hasContractAddress: !!contractAddress,
        hasCallData: !!callData,
        hasAllParams,
      });
    }
  }, [enabled, estimateEnabled, contractAddress, callData, hasAllParams]);

  // Estimate gas units
  const {
    data: gasEstimate,
    isLoading: isEstimating,
    isError: isEstimateError,
    error: estimateError,
    refetch: refetchEstimate,
  } = useEstimateGas({
    to: contractAddress,
    data: callData,
    value,
    query: {
      enabled: estimateEnabled,
      staleTime: GAS_POLL_INTERVAL / 2,
    },
  });

  // Log gas estimation errors (in useEffect to avoid double-invocation in Strict Mode)
  useEffect(() => {
    if (isEstimateError && estimateError) {
      logger.contract.warn('Gas estimation failed - likely contract revert', {
        step,
        error: estimateError.message,
        merkleRoot,
        transactionCount: transactionHashes?.length,
      });
    }
  }, [isEstimateError, estimateError, step, merkleRoot, transactionHashes]);

  // Get current gas price
  const {
    data: gasPrice,
    isLoading: isPriceLoading,
    isError: isPriceError,
    error: priceError,
    refetch: refetchPrice,
  } = useGasPrice({
    query: {
      enabled: estimateEnabled,
      refetchInterval: GAS_POLL_INTERVAL,
      staleTime: GAS_POLL_INTERVAL / 2,
    },
  });

  const refetch = () => {
    refetchEstimate();
    refetchPrice();
    ethPrice.refetch();
  };

  // Build gas estimate result
  const gasEstimateResult = useMemo((): TxGasEstimate | null => {
    if (!gasEstimate || !gasPrice || !ethPrice.data) return null;

    // Add safety buffer
    const gasUnits = (gasEstimate * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;
    const gasCostWei = gasUnits * gasPrice;

    // Convert to USD
    const gasCostEthNum = Number(gasCostWei) / 1e18;
    const gasCostUsdCents = Math.round(gasCostEthNum * ethPrice.data.usdCents);

    const result: TxGasEstimate = {
      gasUnits,
      gasPriceWei: gasPrice,
      gasPriceGwei: formatGwei(gasPrice),
      gasCostWei,
      gasCostEth: formatEthConsistent(gasCostWei),
      gasCostUsd: formatCentsToUsd(gasCostUsdCents),
    };

    logger.contract.debug('Transaction gas estimate updated', {
      step,
      gasUnits: gasUnits.toString(),
      gasPriceGwei: result.gasPriceGwei,
      gasCostUsd: result.gasCostUsd,
    });

    return result;
  }, [gasEstimate, gasPrice, ethPrice.data, step]);

  return {
    data: gasEstimateResult,
    isLoading: isEstimating || isPriceLoading || ethPrice.isLoading,
    isError: isEstimateError || isPriceError || ethPrice.isError,
    error: (estimateError || priceError || ethPrice.error) as Error | null,
    refetch,
  };
}

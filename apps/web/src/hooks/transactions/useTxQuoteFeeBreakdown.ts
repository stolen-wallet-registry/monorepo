/**
 * Hook to get detailed fee breakdown for transaction batch registration.
 *
 * Chain-aware:
 * - Hub: Uses quoteRegistration(reporter) → returns { bridgeFee: null, registrationFee, total }
 * - Spoke: Uses quoteFeeBreakdown(transactionCount) → returns { bridgeFee, registrationFee, total, bridgeName }
 */

import { useMemo } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi, spokeTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress, isSpokeChain } from '@/lib/contracts/addresses';
import { formatFeeLineItem } from '@/lib/utils';
import { useEthPrice } from '@/hooks/useEthPrice';
import type { Address } from '@/lib/types/ethereum';
import type { FeeBreakdown, RawFeeBreakdown } from '@/lib/types/fees';
import { logger } from '@/lib/logger';

export interface UseTxQuoteFeeBreakdownResult {
  /** Normalized fee breakdown with USD formatting */
  data: FeeBreakdown | null;
  /** Raw data from contract (before formatting) */
  raw: RawFeeBreakdown | null;
  /** Total fee in wei (for passing to contract) */
  totalWei: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Get detailed fee breakdown for transaction batch registration.
 *
 * @param reporter - The reporter address (needed for hub nonce-based quote)
 * @param transactionCount - Number of transactions in batch (needed for spoke quote)
 */
export function useTxQuoteFeeBreakdown(
  reporter: Address | null | undefined,
  transactionCount: number
): UseTxQuoteFeeBreakdownResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();
  const isSpoke = isSpokeChain(chainId);

  // Resolve contract address
  let contractAddress: Address | undefined;
  try {
    contractAddress = getTransactionRegistryAddress(chainId);
    logger.contract.debug('useTxQuoteFeeBreakdown: Registry resolved', {
      chainId,
      contractAddress,
      isSpoke,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useTxQuoteFeeBreakdown: Failed to resolve registry', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // On spoke: call quoteFeeBreakdown(transactionCount)
  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeTransactionRegistryAbi,
    chainId,
    functionName: 'quoteFeeBreakdown',
    args: [transactionCount],
    query: {
      enabled: isSpoke && transactionCount > 0 && !!contractAddress,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  // On hub: call quoteRegistration(reporter)
  const hubResult = useReadContract({
    address: contractAddress,
    abi: stolenTransactionRegistryAbi,
    chainId,
    functionName: 'quoteRegistration',
    args: reporter ? [reporter] : undefined,
    query: {
      enabled: !isSpoke && !!reporter && !!contractAddress,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  // Normalize data from either chain type
  const { data, raw, totalWei } = useMemo(() => {
    const ethPriceUsd = ethPrice?.usd;

    // Spoke chain: quoteFeeBreakdown returns a struct
    if (isSpoke && spokeResult.data) {
      const breakdown = spokeResult.data as {
        bridgeFee: bigint;
        registrationFee: bigint;
        total: bigint;
        bridgeName: string;
      };

      logger.contract.debug('useTxQuoteFeeBreakdown: Spoke breakdown received', {
        bridgeFee: breakdown.bridgeFee.toString(),
        registrationFee: breakdown.registrationFee.toString(),
        total: breakdown.total.toString(),
        bridgeName: breakdown.bridgeName,
      });

      const rawBreakdown: RawFeeBreakdown = {
        bridgeFee: breakdown.bridgeFee,
        registrationFee: breakdown.registrationFee,
        total: breakdown.total,
        bridgeName: breakdown.bridgeName,
      };

      const formatted: FeeBreakdown = {
        bridgeFee: formatFeeLineItem(breakdown.bridgeFee, ethPriceUsd),
        registrationFee: formatFeeLineItem(breakdown.registrationFee, ethPriceUsd),
        total: formatFeeLineItem(breakdown.total, ethPriceUsd),
        bridgeName: breakdown.bridgeName,
        isCrossChain: true,
      };

      return { data: formatted, raw: rawBreakdown, totalWei: breakdown.total };
    }

    // Hub chain: quoteRegistration returns single uint256 (all registration fee, no bridge)
    if (!isSpoke && hubResult.data) {
      const feeWei = hubResult.data as bigint;

      logger.contract.debug('useTxQuoteFeeBreakdown: Hub fee received', {
        feeWei: feeWei.toString(),
      });

      const rawBreakdown: RawFeeBreakdown = {
        bridgeFee: 0n,
        registrationFee: feeWei,
        total: feeWei,
        bridgeName: '',
      };

      const formatted: FeeBreakdown = {
        bridgeFee: null,
        registrationFee: formatFeeLineItem(feeWei, ethPriceUsd),
        total: formatFeeLineItem(feeWei, ethPriceUsd),
        bridgeName: null,
        isCrossChain: false,
      };

      return { data: formatted, raw: rawBreakdown, totalWei: feeWei };
    }

    return { data: null, raw: null, totalWei: undefined };
  }, [isSpoke, spokeResult.data, hubResult.data, ethPrice?.usd]);

  // Determine loading/error state based on active query
  const activeResult = isSpoke ? spokeResult : hubResult;

  return {
    data,
    raw,
    totalWei,
    isLoading: activeResult.isLoading,
    isError: activeResult.isError,
    error: activeResult.error,
    refetch: activeResult.refetch,
  };
}

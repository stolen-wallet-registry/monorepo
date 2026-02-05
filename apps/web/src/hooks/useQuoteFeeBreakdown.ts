/**
 * Hooks to get detailed fee breakdown for registration.
 *
 * Supports both wallet and transaction registries.
 * Unified interface: Both hub and spoke expose quoteFeeBreakdown(address).
 * - Hub: returns { bridgeFee: 0, registrationFee, total, bridgeName: "" }
 * - Spoke: returns { bridgeFee, registrationFee, total, bridgeName: "Hyperlane" }
 */

import { useMemo } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
import { formatFeeLineItem } from '@/lib/utils';
import { useEthPrice } from './useEthPrice';
import type { Address } from '@/lib/types/ethereum';
import type { FeeBreakdown, RawFeeBreakdown } from '@/lib/types/fees';
import { logger } from '@/lib/logger';

// ============================================================================
// Wallet Registry Fee Breakdown
// ============================================================================

export interface UseQuoteFeeBreakdownResult {
  /** Normalized fee breakdown with USD formatting */
  data: FeeBreakdown | null;
  /** Raw data from contract (before formatting) */
  raw: RawFeeBreakdown | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Get detailed fee breakdown for wallet registration.
 *
 * @param ownerAddress - The wallet being registered (used by spoke for bridge quote, ignored on hub)
 */
export function useQuoteFeeBreakdown(
  ownerAddress: Address | null | undefined
): UseQuoteFeeBreakdownResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useQuoteFeeBreakdown'
  );

  // Get the correct ABI and function name (unified: quoteFeeBreakdown on both hub and spoke)
  const { abi, functions } = getRegistryMetadata('wallet', registryType);

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = ownerAddress ?? undefined;

  // Unified call: quoteFeeBreakdown(address) on both hub and spoke
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic function name from metadata
  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    functionName: functions.quoteFeeBreakdown as any,
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: !!normalizedAddress && !!contractAddress,
      staleTime: 30_000,
    },
  });

  // Normalize data from contract response
  const { data, raw } = useMemo(() => {
    if (!result.data) return { data: null, raw: null };

    const ethPriceUsd = ethPrice?.usd;
    const isCrossChain = registryType === 'spoke';

    // Both hub and spoke return the same FeeBreakdown struct
    const breakdown = result.data as {
      bridgeFee: bigint;
      registrationFee: bigint;
      total: bigint;
      bridgeName: string;
    };

    logger.contract.debug('useQuoteFeeBreakdown: Breakdown received', {
      registryType,
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
      bridgeFee:
        breakdown.bridgeFee > 0n ? formatFeeLineItem(breakdown.bridgeFee, ethPriceUsd) : null,
      registrationFee: formatFeeLineItem(breakdown.registrationFee, ethPriceUsd),
      total: formatFeeLineItem(breakdown.total, ethPriceUsd),
      bridgeName: breakdown.bridgeName || null,
      isCrossChain,
    };

    return { data: formatted, raw: rawBreakdown };
  }, [result.data, ethPrice?.usd, registryType]);

  return {
    data,
    raw,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

// ============================================================================
// Transaction Registry Fee Breakdown
// ============================================================================

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
 * @param reporter - The reporter address (used by spoke for bridge quote, ignored on hub)
 * @param _transactionCount - Deprecated: V2 uses flat fees, count is no longer needed
 */
export function useTxQuoteFeeBreakdown(
  reporter: Address | null | undefined,
  _transactionCount?: number // eslint-disable-line @typescript-eslint/no-unused-vars
): UseTxQuoteFeeBreakdownResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTxQuoteFeeBreakdown'
  );

  // Get the correct ABI and function name (unified: quoteFeeBreakdown on both hub and spoke)
  const { abi, functions } = getRegistryMetadata('transaction', registryType);

  // Unified call: quoteFeeBreakdown(address) on both hub and spoke
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic function name from metadata
  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    functionName: functions.quoteFeeBreakdown as any,
    args: reporter ? [reporter] : undefined,
    query: {
      enabled: !!reporter && !!contractAddress,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  // Normalize data from contract response
  const { data, raw, totalWei } = useMemo(() => {
    if (!result.data) return { data: null, raw: null, totalWei: undefined };

    const ethPriceUsd = ethPrice?.usd;
    const isCrossChain = registryType === 'spoke';

    // Both hub and spoke return the same FeeBreakdown struct
    const breakdown = result.data as {
      bridgeFee: bigint;
      registrationFee: bigint;
      total: bigint;
      bridgeName: string;
    };

    logger.contract.debug('useTxQuoteFeeBreakdown: Breakdown received', {
      registryType,
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
      bridgeFee:
        breakdown.bridgeFee > 0n ? formatFeeLineItem(breakdown.bridgeFee, ethPriceUsd) : null,
      registrationFee: formatFeeLineItem(breakdown.registrationFee, ethPriceUsd),
      total: formatFeeLineItem(breakdown.total, ethPriceUsd),
      bridgeName: breakdown.bridgeName || null,
      isCrossChain,
    };

    return { data: formatted, raw: rawBreakdown, totalWei: breakdown.total };
  }, [result.data, ethPrice?.usd, registryType]);

  return {
    data,
    raw,
    totalWei,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

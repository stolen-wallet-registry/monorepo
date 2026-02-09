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
import { walletRegistryAbi, transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
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

  const isSpoke = registryType === 'spoke';

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = ownerAddress ?? undefined;
  const enabled = !!normalizedAddress && !!contractAddress;

  // Split-call: one hook per ABI, only one fires based on registryType
  const hubResult = useReadContract({
    address: contractAddress,
    abi: walletRegistryAbi,
    chainId,
    functionName: 'quoteFeeBreakdown',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: !isSpoke && enabled,
      staleTime: 30_000,
    },
  });

  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    chainId,
    functionName: 'quoteFeeBreakdown',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: isSpoke && enabled,
      staleTime: 30_000,
    },
  });

  const result = isSpoke ? spokeResult : hubResult;

  // Extract typed data from the active hook (avoids union-type complications)
  const hubBreakdown = hubResult.data as RawFeeBreakdown | undefined;
  const spokeBreakdown = spokeResult.data as RawFeeBreakdown | undefined;
  const activeBreakdown = isSpoke ? spokeBreakdown : hubBreakdown;

  // Normalize data from contract response
  const { data, raw } = useMemo(() => {
    if (!activeBreakdown) return { data: null, raw: null };

    const ethPriceUsd = ethPrice?.usd;
    const isCrossChain = isSpoke;

    const breakdown = activeBreakdown;

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
  }, [activeBreakdown, ethPrice?.usd, isSpoke, registryType]);

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
 * @param _transactionCount - Deprecated: uses flat fees, count is no longer needed
 */
export function useTxQuoteFeeBreakdown(
  reporter: Address | null | undefined,
  _transactionCount?: number
): UseTxQuoteFeeBreakdownResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTxQuoteFeeBreakdown'
  );

  const isSpoke = registryType === 'spoke';
  const enabled = !!reporter && !!contractAddress;

  // Split-call: one hook per ABI, only one fires based on registryType
  const hubResult = useReadContract({
    address: contractAddress,
    abi: transactionRegistryAbi,
    chainId,
    functionName: 'quoteFeeBreakdown',
    args: reporter ? [reporter] : undefined,
    query: {
      enabled: !isSpoke && enabled,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    chainId,
    functionName: 'quoteFeeBreakdown',
    args: reporter ? [reporter] : undefined,
    query: {
      enabled: isSpoke && enabled,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });

  const result = isSpoke ? spokeResult : hubResult;

  // Extract typed data from the active hook (avoids union-type complications)
  const txHubBreakdown = hubResult.data as RawFeeBreakdown | undefined;
  const txSpokeBreakdown = spokeResult.data as RawFeeBreakdown | undefined;
  const txActiveBreakdown = isSpoke ? txSpokeBreakdown : txHubBreakdown;

  // Normalize data from contract response
  const { data, raw, totalWei } = useMemo(() => {
    if (!txActiveBreakdown) return { data: null, raw: null, totalWei: undefined };

    const ethPriceUsd = ethPrice?.usd;
    const isCrossChain = isSpoke;

    const breakdown = txActiveBreakdown;

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
  }, [txActiveBreakdown, ethPrice?.usd, isSpoke, registryType]);

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

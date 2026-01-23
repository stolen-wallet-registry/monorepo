/**
 * Hooks to get detailed fee breakdown for registration.
 *
 * Supports both wallet and transaction registries.
 * Chain-aware: Uses quoteFeeBreakdown() on spoke chains, quoteRegistration() on hub.
 * - Hub: returns { bridgeFee: null, registrationFee, total, bridgeName: null, isCrossChain: false }
 * - Spoke: returns { bridgeFee, registrationFee, total, bridgeName: "Hyperlane", isCrossChain: true }
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
 * @param ownerAddress - The wallet being registered (needed for nonce in quote)
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

  // Get the correct ABIs for hub/spoke (need both for conditional queries)
  const hubMetadata = getRegistryMetadata('wallet', 'hub');
  const spokeMetadata = getRegistryMetadata('wallet', 'spoke');

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = ownerAddress ?? undefined;

  // On spoke: call quoteFeeBreakdown()
  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeMetadata.abi,
    chainId,
    functionName: 'quoteFeeBreakdown',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: registryType === 'spoke' && !!normalizedAddress && !!contractAddress,
      staleTime: 30_000,
    },
  });

  // On hub: call quoteRegistration() (single value)
  const hubResult = useReadContract({
    address: contractAddress,
    abi: hubMetadata.abi,
    chainId,
    functionName: 'quoteRegistration',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: registryType === 'hub' && !!normalizedAddress && !!contractAddress,
      staleTime: 30_000,
    },
  });

  // Normalize data from either chain type
  const { data, raw } = useMemo(() => {
    const ethPriceUsd = ethPrice?.usd;

    // Spoke chain: quoteFeeBreakdown returns a struct
    if (registryType === 'spoke' && spokeResult.data) {
      const breakdown = spokeResult.data as {
        bridgeFee: bigint;
        registrationFee: bigint;
        total: bigint;
        bridgeName: string;
      };

      logger.contract.debug('useQuoteFeeBreakdown: Spoke breakdown received', {
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

      return { data: formatted, raw: rawBreakdown };
    }

    // Hub chain: quoteRegistration returns single uint256 (all registration fee, no bridge)
    if (registryType === 'hub' && hubResult.data) {
      const feeWei = hubResult.data as bigint;

      logger.contract.debug('useQuoteFeeBreakdown: Hub fee received', {
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

      return { data: formatted, raw: rawBreakdown };
    }

    return { data: null, raw: null };
  }, [registryType, spokeResult.data, hubResult.data, ethPrice?.usd]);

  // Determine loading/error state based on active query
  const activeResult = registryType === 'spoke' ? spokeResult : hubResult;

  return {
    data,
    raw,
    isLoading: activeResult.isLoading,
    isError: activeResult.isError,
    error: activeResult.error,
    refetch: activeResult.refetch,
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
 * @param reporter - The reporter address (needed for hub nonce-based quote)
 * @param transactionCount - Number of transactions in batch (needed for spoke quote)
 */
export function useTxQuoteFeeBreakdown(
  reporter: Address | null | undefined,
  transactionCount: number
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

  // Get the correct ABIs for hub/spoke (need both for conditional queries)
  const hubMetadata = getRegistryMetadata('transaction', 'hub');
  const spokeMetadata = getRegistryMetadata('transaction', 'spoke');

  // On spoke: call quoteFeeBreakdown(transactionCount)
  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeMetadata.abi,
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
    abi: hubMetadata.abi,
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

/**
 * Hook to get detailed fee breakdown for registration.
 *
 * Chain-aware: Uses quoteFeeBreakdown() on spoke chains, quoteRegistration() on hub.
 * - Hub: returns { bridgeFee: null, registrationFee, total, bridgeName: null, isCrossChain: false }
 * - Spoke: returns { bridgeFee, registrationFee, total, bridgeName: "Hyperlane", isCrossChain: true }
 */

import { useMemo } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
import { formatEthConsistent } from '@/lib/utils';
import { useEthPrice } from './useEthPrice';
import type { Address } from '@/lib/types/ethereum';
import type { FeeBreakdown, FeeLineItem, RawFeeBreakdown } from '@/lib/types/fees';
import { logger } from '@/lib/logger';

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
 * Format a fee amount into a FeeLineItem with wei, eth, and usd.
 */
function formatFeeLineItem(wei: bigint, ethPriceUsd: number | undefined): FeeLineItem {
  const eth = formatEthConsistent(wei);
  const ethAsNumber = Number(eth);

  let usd: string;
  if (ethPriceUsd && ethPriceUsd > 0) {
    const usdValue = ethAsNumber * ethPriceUsd;
    usd = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(usdValue);
  } else {
    // Fallback if no price data
    usd = '—';
  }

  return { wei, eth, usd };
}

/**
 * Get detailed fee breakdown for registration.
 *
 * @param ownerAddress - The wallet being registered (needed for nonce in quote)
 */
export function useQuoteFeeBreakdown(
  ownerAddress: Address | null | undefined
): UseQuoteFeeBreakdownResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();

  // Resolve contract address and type
  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
    logger.contract.debug('useQuoteFeeBreakdown: Registry resolved', {
      chainId,
      contractAddress,
      registryType,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useQuoteFeeBreakdown: Failed to resolve registry', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = ownerAddress ?? undefined;

  // On spoke: call quoteFeeBreakdown()
  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
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
    abi: stolenWalletRegistryAbi,
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

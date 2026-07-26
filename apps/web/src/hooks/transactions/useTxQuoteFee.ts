/**
 * Hook to get the registration fee for transaction batch registration.
 *
 * Supports both hub (TransactionRegistry.quoteRegistration) and spoke
 * (SpokeRegistry.quoteTransactionBatchRegistration) chains. The spoke quote is
 * batch-aware because its bridge fee scales with the acknowledged entry count.
 */

import { useMemo } from 'react';
import { useReadContract, useChainId } from 'wagmi';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { formatEthConsistent } from '@/lib/utils';
import { useEthPrice } from '@/hooks/useEthPrice';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface TxQuoteFeeData {
  /** Fee amount in wei */
  feeWei: bigint;
  /** Fee amount in ETH (formatted string) */
  feeEth: string;
  /** Fee in USD (formatted string, e.g., "$5.00") */
  feeUsd: string;
}

export interface UseTxQuoteFeeResult {
  /** The quoted fee data, or null if loading/error */
  data: TxQuoteFeeData | null;
  /** Raw fee in wei (for passing to contract) */
  feeWei: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to get the registration fee for transaction batch registration.
 *
 * @param reporterAddress - The reporter address (used for nonce-based fee calculation)
 * @returns Fee data with wei, eth, and USD formatting
 */
export function useTxQuoteFee(reporterAddress: Address | null | undefined): UseTxQuoteFeeResult {
  const chainId = useChainId();
  const { data: ethPrice } = useEthPrice();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTxQuoteFee'
  );

  const isSpoke = registryType === 'spoke';

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = reporterAddress ?? undefined;
  const enabled = !!normalizedAddress && !!contractAddress;

  const sharedQuery = { staleTime: 30_000, refetchInterval: 60_000 };

  // Split-call: one hook per ABI, only one fires based on registryType
  const hubResult = useReadContract({
    address: contractAddress,
    abi: transactionRegistryAbi,
    chainId,
    functionName: 'quoteRegistration',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: !isSpoke && enabled,
      ...sharedQuery,
    },
  });

  // Spokes must use the batch-specific quote. The spoke fee includes a bridge fee whose
  // destination gas scales with the number of entries in the message, and the generic
  // quoteRegistration() prices a single-entry wallet message. Quoting a multi-transaction
  // batch that way under-funds it and registerTransactionBatch reverts on the fee check.
  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    chainId,
    functionName: 'quoteTransactionBatchRegistration',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: isSpoke && enabled,
      ...sharedQuery,
    },
  });

  const { data: rawFee, isLoading, isError, error, refetch } = isSpoke ? spokeResult : hubResult;

  // Transform raw fee into formatted data
  const data = useMemo(() => {
    if (rawFee === undefined) return null;

    let feeWei: bigint;
    if (typeof rawFee === 'bigint') {
      feeWei = rawFee;
    } else {
      logger.contract.warn('useTxQuoteFee: unexpected rawFee type', {
        rawFee: String(rawFee),
        type: typeof rawFee,
      });
      feeWei = 0n;
    }
    const feeEth = formatEthConsistent(feeWei);
    const ethPriceUsd = ethPrice?.usd;

    let feeUsd: string;
    if (ethPriceUsd && ethPriceUsd > 0) {
      const ethNum = Number(feeEth);
      const usdValue = ethNum * ethPriceUsd;
      feeUsd = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(usdValue);
    } else {
      feeUsd = '—';
    }

    logger.contract.debug('useTxQuoteFee: Fee calculated', {
      feeWei: feeWei.toString(),
      feeEth,
      feeUsd,
    });

    return {
      feeWei,
      feeEth,
      feeUsd,
    };
  }, [rawFee, ethPrice?.usd]);

  return {
    data,
    feeWei: data?.feeWei,
    isLoading,
    isError,
    error,
    refetch,
  };
}

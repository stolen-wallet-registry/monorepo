/**
 * Hook to poll FeeManager for the current protocol fee.
 *
 * Returns the $5 registration fee in multiple formats (wei, ETH, USD)
 * along with current ETH price data from CoinGecko.
 */

import { useReadContracts, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { feeManagerAbi } from '@/lib/contracts/abis';
import { getFeeManagerAddress } from '@/lib/contracts/addresses';
import { useEthPrice } from './useEthPrice';
import { logger } from '@/lib/logger';

export interface FeeEstimate {
  /** Fee amount in wei (native bigint) */
  feeWei: bigint;
  /** Fee amount in ETH (formatted string, e.g., "0.00143") */
  feeEth: string;
  /** Fee in USD cents (e.g., 500 = $5.00) */
  feeUsdCents: number;
  /** Fee in USD (formatted string, e.g., "$5.00") */
  feeUsd: string;
  /** ETH price in USD cents (e.g., 350000 = $3,500.00) */
  ethPriceUsdCents: number;
  /** ETH price in USD (formatted string, e.g., "$3,500.00") */
  ethPriceUsd: string;
}

export interface UseFeeEstimateResult {
  /** The fee estimate data, or null if loading/error */
  data: FeeEstimate | null;
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Whether there was an error fetching data */
  isError: boolean;
  /** The error object if there was an error */
  error: Error | null;
  /** Function to manually refetch the data */
  refetch: () => void;
}

/** Polling interval for fee estimates (30 seconds) */
const FEE_POLL_INTERVAL = 30_000;

/**
 * Format cents to USD string (e.g., 500 → "$5.00")
 */
function formatCentsToUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Hook to get the current protocol fee from FeeManager.
 *
 * Polls the contract every 30 seconds for updated pricing.
 * Returns null if FeeManager is not configured (free registrations).
 *
 * @example
 * ```tsx
 * const { data, isLoading, isError } = useFeeEstimate();
 *
 * if (isLoading) return <Spinner />;
 * if (isError) return <ErrorMessage />;
 * if (!data) return <span>Free registration</span>;
 *
 * return (
 *   <div>
 *     <p>Fee: {data.feeUsd} ({data.feeEth} ETH)</p>
 *     <p>ETH Price: {data.ethPriceUsd}</p>
 *   </div>
 * );
 * ```
 */
export function useFeeEstimate(): UseFeeEstimateResult {
  const chainId = useChainId();

  // Get real ETH price from CoinGecko
  const ethPrice = useEthPrice();

  let feeManagerAddress: `0x${string}` | undefined;
  try {
    feeManagerAddress = getFeeManagerAddress(chainId);
  } catch {
    feeManagerAddress = undefined;
  }

  const enabled = !!feeManagerAddress;

  const {
    data,
    isLoading: isContractLoading,
    isError: isContractError,
    error: contractError,
    refetch: refetchContract,
  } = useReadContracts({
    contracts: [
      {
        address: feeManagerAddress!,
        abi: feeManagerAbi,
        functionName: 'currentFeeWei',
      },
      {
        address: feeManagerAddress!,
        abi: feeManagerAbi,
        functionName: 'baseFeeUsdCents',
      },
    ],
    query: {
      enabled,
      refetchInterval: FEE_POLL_INTERVAL,
      staleTime: FEE_POLL_INTERVAL / 2,
    },
  });

  const refetch = () => {
    refetchContract();
    ethPrice.refetch();
  };

  // Transform raw data into FeeEstimate
  let feeEstimate: FeeEstimate | null = null;

  if (data && data[0].status === 'success' && data[1].status === 'success') {
    const feeWei = data[0].result as bigint;
    const feeUsdCents = Number(data[1].result);

    // Use real ETH price from CoinGecko, fallback to calculated price from fee
    const ethPriceUsdCents =
      ethPrice.data?.usdCents ?? Math.round((feeUsdCents / Number(formatEther(feeWei))) * 100);
    const ethPriceUsd = ethPrice.data?.usdFormatted ?? formatCentsToUsd(ethPriceUsdCents);

    feeEstimate = {
      feeWei,
      feeEth: formatEther(feeWei),
      feeUsdCents,
      feeUsd: formatCentsToUsd(feeUsdCents),
      ethPriceUsdCents,
      ethPriceUsd,
    };

    logger.contract.debug('Fee estimate updated', {
      feeWei: feeWei.toString(),
      feeUsd: feeEstimate.feeUsd,
      ethPriceUsd: feeEstimate.ethPriceUsd,
      priceSource: ethPrice.data ? 'CoinGecko' : 'contract',
    });
  }

  return {
    data: feeEstimate,
    isLoading: isContractLoading || ethPrice.isLoading,
    isError: isContractError,
    error: contractError as Error | null,
    refetch,
  };
}

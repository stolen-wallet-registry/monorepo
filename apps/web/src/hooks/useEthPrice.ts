/**
 * Hook to fetch real-time ETH price from CoinGecko.
 *
 * Uses the free CoinGecko API (no API key required).
 * Polls every 60 seconds for updated pricing.
 */

import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

export interface EthPriceData {
  /** ETH price in USD */
  usd: number;
  /** ETH price in USD cents (for consistency with contract) */
  usdCents: number;
  /** Formatted USD string (e.g., "$3,500.00") */
  usdFormatted: string;
}

export interface UseEthPriceResult {
  data: EthPriceData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/** CoinGecko free API endpoint */
const COINGECKO_API =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

/** Poll interval: 60 seconds */
const POLL_INTERVAL = 60_000;

/** Stale time: 30 seconds */
const STALE_TIME = 30_000;

interface CoinGeckoResponse {
  ethereum: {
    usd: number;
  };
}

/**
 * Fetch ETH price from CoinGecko.
 */
async function fetchEthPrice(): Promise<EthPriceData> {
  const response = await fetch(COINGECKO_API);

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const data: CoinGeckoResponse = await response.json();
  const usd = data.ethereum.usd;
  const usdCents = Math.round(usd * 100);

  const usdFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(usd);

  logger.contract.debug('ETH price fetched from CoinGecko', {
    usd,
    usdFormatted,
  });

  return {
    usd,
    usdCents,
    usdFormatted,
  };
}

/**
 * Hook to get real-time ETH price from CoinGecko.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useEthPrice();
 * if (data) {
 *   console.log(`ETH: ${data.usdFormatted}`); // "ETH: $3,500.00"
 * }
 * ```
 */
export function useEthPrice(): UseEthPriceResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ethPrice'],
    queryFn: fetchEthPrice,
    refetchInterval: POLL_INTERVAL,
    staleTime: STALE_TIME,
    retry: 2,
    retryDelay: 5000,
  });

  return {
    data: data ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

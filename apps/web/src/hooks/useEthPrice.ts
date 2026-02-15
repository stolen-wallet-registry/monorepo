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

/** Request timeout: 5 seconds */
const REQUEST_TIMEOUT = 5_000;

interface CoinGeckoResponse {
  ethereum: {
    usd: number;
  };
}

/**
 * Validates CoinGecko response structure.
 */
function validateCoinGeckoResponse(data: unknown): data is CoinGeckoResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'ethereum' in data &&
    typeof (data as Record<string, unknown>).ethereum === 'object' &&
    (data as Record<string, unknown>).ethereum !== null &&
    'usd' in ((data as Record<string, unknown>).ethereum as Record<string, unknown>) &&
    typeof ((data as Record<string, unknown>).ethereum as Record<string, unknown>).usd ===
      'number' &&
    Number.isFinite(((data as Record<string, unknown>).ethereum as Record<string, unknown>).usd)
  );
}

/**
 * Fetch ETH price from CoinGecko with timeout.
 */
async function fetchEthPrice(): Promise<EthPriceData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(COINGECKO_API, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (parseError) {
      logger.contract.error('Failed to parse CoinGecko response', { parseError });
      throw new Error('Invalid JSON response from CoinGecko');
    }

    if (!validateCoinGeckoResponse(data)) {
      logger.contract.error('Invalid CoinGecko response structure', { data });
      throw new Error('Unexpected response structure from CoinGecko');
    }

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
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      logger.contract.error('CoinGecko request timed out', { timeout: REQUEST_TIMEOUT });
      throw new Error('CoinGecko request timed out', { cause: error });
    }
    throw error;
  }
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

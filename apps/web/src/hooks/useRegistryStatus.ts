/**
 * Hook to query registry status for a wallet address.
 *
 * Batches multiple contract calls to efficiently determine if a wallet is:
 * - Already registered as stolen
 * - Pending registration (acknowledgement submitted, awaiting registration)
 * - Clean (not in registry)
 */

import { useReadContracts, useChainId } from 'wagmi';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getStolenWalletRegistryAddress } from '@/lib/contracts/addresses';
import { registryStaleTime } from '@/lib/contracts/queryKeys';
import { logger } from '@/lib/logger';

/**
 * Registration data from the contract.
 */
export interface RegistrationData {
  /** Block number when registration was completed */
  registeredAt: bigint;
  /** Address that submitted the registration transaction */
  registeredBy: `0x${string}`;
  /** Whether registration was sponsored (paid by different wallet) */
  isSponsored: boolean;
}

/**
 * Acknowledgement data from the contract.
 */
export interface AcknowledgementData {
  /** Address authorized to submit registration */
  trustedForwarder: `0x${string}`;
  /** Block when grace period starts */
  startBlock: bigint;
  /** Block when acknowledgement expires */
  expiryBlock: bigint;
}

/**
 * Combined registry status for a wallet.
 */
export interface RegistryStatus {
  /** Whether the wallet is registered as stolen */
  isRegistered: boolean;
  /** Whether the wallet has a pending acknowledgement */
  isPending: boolean;
  /** Registration details (if registered) */
  registrationData: RegistrationData | null;
  /** Acknowledgement details (if pending) */
  acknowledgementData: AcknowledgementData | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch status */
  refetch: () => void;
}

/**
 * Options for useRegistryStatus hook.
 */
export interface UseRegistryStatusOptions {
  /** Address to query (undefined skips query) */
  address?: `0x${string}`;
  /** Enable automatic refetch interval (ms) or false to disable */
  refetchInterval?: number | false;
}

/**
 * Queries registry status for a wallet address.
 *
 * Uses batched contract reads for efficiency:
 * - isRegistered() - boolean check
 * - isPending() - boolean check
 * - getRegistration() - full registration data
 * - getAcknowledgement() - full acknowledgement data
 *
 * @example
 * ```tsx
 * const { isRegistered, isPending, isLoading } = useRegistryStatus({
 *   address: '0x...',
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (isRegistered) return <Alert variant="destructive">Wallet is registered as stolen</Alert>;
 * if (isPending) return <Alert variant="warning">Registration pending</Alert>;
 * return <Alert variant="success">Wallet is clean</Alert>;
 * ```
 */
export function useRegistryStatus({
  address,
  refetchInterval = false,
}: UseRegistryStatusOptions): RegistryStatus {
  const chainId = useChainId();

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getStolenWalletRegistryAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  const enabled = !!address && !!contractAddress;

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts: [
      {
        address: contractAddress!,
        abi: stolenWalletRegistryAbi,
        functionName: 'isRegistered',
        args: [address!],
      },
      {
        address: contractAddress!,
        abi: stolenWalletRegistryAbi,
        functionName: 'isPending',
        args: [address!],
      },
      {
        address: contractAddress!,
        abi: stolenWalletRegistryAbi,
        functionName: 'getRegistration',
        args: [address!],
      },
      {
        address: contractAddress!,
        abi: stolenWalletRegistryAbi,
        functionName: 'getAcknowledgement',
        args: [address!],
      },
    ],
    query: {
      enabled,
      staleTime: registryStaleTime.status,
      refetchInterval,
    },
  });

  // Transform contract results into typed data
  const isRegistered = data?.[0]?.status === 'success' ? (data[0].result as boolean) : false;
  const isPending = data?.[1]?.status === 'success' ? (data[1].result as boolean) : false;

  // Registration data (only valid if isRegistered is true)
  let registrationData: RegistrationData | null = null;
  if (data?.[2]?.status === 'success' && isRegistered) {
    const result = data[2].result as {
      registeredAt: bigint;
      registeredBy: `0x${string}`;
      isSponsored: boolean;
    };
    registrationData = {
      registeredAt: result.registeredAt,
      registeredBy: result.registeredBy,
      isSponsored: result.isSponsored,
    };
  }

  // Acknowledgement data (only valid if isPending is true)
  let acknowledgementData: AcknowledgementData | null = null;
  if (data?.[3]?.status === 'success' && isPending) {
    const result = data[3].result as {
      trustedForwarder: `0x${string}`;
      startBlock: bigint;
      expiryBlock: bigint;
    };
    acknowledgementData = {
      trustedForwarder: result.trustedForwarder,
      startBlock: result.startBlock,
      expiryBlock: result.expiryBlock,
    };
  }

  // Log status for debugging
  if (enabled && !isLoading && !isError) {
    logger.contract.debug('Registry status query', {
      address,
      isRegistered,
      isPending,
      hasRegistrationData: !!registrationData,
      hasAcknowledgementData: !!acknowledgementData,
    });
  }

  return {
    isRegistered,
    isPending,
    registrationData,
    acknowledgementData,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}

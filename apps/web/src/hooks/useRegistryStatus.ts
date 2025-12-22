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
import type { Address, Hex } from '@/lib/types/ethereum';

/**
 * Registration data from the contract.
 * @dev Updated for cross-chain support.
 *      registeredBy and registrationMethod removed for privacy
 *      (would reveal multi-wallet ownership or relayer relationships).
 */
export interface RegistrationData {
  /** Block number when registration was completed (on hub chain) */
  registeredAt: bigint;
  /** EIP-155 chain ID where user signed (0 for native hub registration) */
  sourceChainId: number;
  /** Bridge that delivered message (0=NONE for native) */
  bridgeId: number;
  /** Whether registration was sponsored (paid by different wallet) */
  isSponsored: boolean;
  /** Cross-chain message ID for explorer linking (0x0 for native) */
  crossChainMessageId: Hex;
}

/**
 * Acknowledgement data from the contract.
 */
export interface AcknowledgementData {
  /** Address authorized to submit registration */
  trustedForwarder: Address;
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
  address?: Address;
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

  let contractAddress: Address | undefined;
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
      sourceChainId: number;
      bridgeId: number;
      isSponsored: boolean;
      crossChainMessageId: Hex;
    };
    registrationData = {
      registeredAt: result.registeredAt,
      sourceChainId: result.sourceChainId,
      bridgeId: result.bridgeId,
      isSponsored: result.isSponsored,
      crossChainMessageId: result.crossChainMessageId,
    };
  }

  // Acknowledgement data (only valid if isPending is true)
  let acknowledgementData: AcknowledgementData | null = null;
  if (data?.[3]?.status === 'success' && isPending) {
    const result = data[3].result as {
      trustedForwarder: Address;
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

/**
 * Core registry query functions.
 *
 * Two interfaces available:
 * - queryRegistryStatus: Low-level, takes a PublicClient (for wagmi integration)
 * - queryRegistryStatusSimple: High-level, creates client internally (for landing page)
 */

import {
  createPublicClient,
  http,
  isAddress,
  type PublicClient,
  type Address,
  type Abi,
  type Chain,
} from 'viem';
import { base, baseSepolia, optimismSepolia } from 'viem/chains';
import type { RegistryStatusResult, RegistrationData, AcknowledgementData } from './types';

/**
 * Supported chain configurations.
 *
 * Note: This should be kept in sync with the chains defined in:
 * - apps/web/src/lib/wagmi.ts (wagmi config)
 * - packages/ui/src/lib/blocks.ts (BLOCK_TIMES)
 *
 * When adding new chains, ensure they're added to all three locations.
 */
const CHAIN_CONFIGS: Record<number, Chain> = {
  // Mainnets
  8453: base,
  // Testnets
  84532: baseSepolia,
  11155420: optimismSepolia,
};

/**
 * Query registry status for a wallet address.
 *
 * Uses multicall to batch 4 contract reads efficiently:
 * - isRegistered() - boolean check
 * - isPending() - boolean check
 * - getRegistration() - full registration data
 * - getAcknowledgement() - full acknowledgement data
 *
 * Note: Requires multicall3 contract to be deployed. For local Anvil chains,
 * our deploy scripts deploy Multicall3 and the chain config includes the address.
 *
 * **Return Value Semantics:**
 * - `isRegistered`: True if the address is registered as stolen
 * - `isPending`: True if the address has an active acknowledgement awaiting registration
 * - `registrationData`: Detailed registration info (when available, may be null even if isRegistered is true)
 * - `acknowledgementData`: Detailed acknowledgement info (when available, may be null even if isPending is true)
 *
 * **Edge Case - Partial Multicall Failures:**
 * In rare cases, the boolean checks may succeed while the detail fetches fail (e.g., due to RPC
 * issues or contract state changes between calls). When this happens:
 * - `isRegistered` may be `true` while `registrationData` is `null`
 * - `isPending` may be `true` while `acknowledgementData` is `null`
 * Callers should handle this by checking both the boolean flag AND the presence of detail data
 * when detail data is required for their use case.
 *
 * @param client - viem PublicClient (from wagmi or createPublicClient)
 * @param address - Wallet address to query
 * @param contractAddress - StolenWalletRegistry contract address
 * @param abi - Contract ABI (must include isRegistered, isPending, getRegistration, getAcknowledgement)
 *
 * @example
 * ```ts
 * // Web app with wagmi
 * const client = usePublicClient();
 * const result = await queryRegistryStatus(client, address, contractAddr, stolenWalletRegistryAbi);
 *
 * // Landing page with standalone client
 * const client = createPublicClient({ chain: base, transport: http() });
 * const result = await queryRegistryStatus(client, address, contractAddr, stolenWalletRegistryAbi);
 *
 * // Handle partial data gracefully
 * if (result.isRegistered) {
 *   if (result.registrationData) {
 *     console.log('Registered at:', result.registrationData.registeredAt);
 *   } else {
 *     console.log('Registered, but details unavailable');
 *   }
 * }
 * ```
 */
export async function queryRegistryStatus(
  client: PublicClient,
  address: Address,
  contractAddress: Address,
  abi: Abi
): Promise<RegistryStatusResult> {
  const results = await client.multicall({
    contracts: [
      {
        address: contractAddress,
        abi,
        functionName: 'isRegistered',
        args: [address],
      },
      {
        address: contractAddress,
        abi,
        functionName: 'isPending',
        args: [address],
      },
      {
        address: contractAddress,
        abi,
        functionName: 'getRegistration',
        args: [address],
      },
      {
        address: contractAddress,
        abi,
        functionName: 'getAcknowledgement',
        args: [address],
      },
    ],
  });

  // Extract results with proper error handling
  const isRegistered = results[0].status === 'success' ? (results[0].result as boolean) : false;
  const isPending = results[1].status === 'success' ? (results[1].result as boolean) : false;

  // Registration data (when available - may be null even if isRegistered is true due to partial failures)
  let registrationData: RegistrationData | null = null;
  if (results[2].status === 'success' && isRegistered) {
    const result = results[2].result as {
      registeredAt: bigint;
      sourceChainId: number;
      bridgeId: number;
      isSponsored: boolean;
      crossChainMessageId: `0x${string}`;
    };
    registrationData = {
      registeredAt: result.registeredAt,
      sourceChainId: result.sourceChainId,
      bridgeId: result.bridgeId,
      isSponsored: result.isSponsored,
      crossChainMessageId: result.crossChainMessageId,
    };
  }

  // Acknowledgement data (when available - may be null even if isPending is true due to partial failures)
  let acknowledgementData: AcknowledgementData | null = null;
  if (results[3].status === 'success' && isPending) {
    const result = results[3].result as {
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

  return {
    isRegistered,
    isPending,
    registrationData,
    acknowledgementData,
  };
}

/**
 * Simplified query function that creates the client internally.
 *
 * Use this when you don't have a wagmi context (e.g., landing page).
 * Handles client creation automatically based on chainId.
 *
 * @param chainId - Chain ID (8453 for Base mainnet, 84532 for Base Sepolia)
 * @param address - Wallet address to query (as string, will be cast to Address)
 * @param contractAddress - StolenWalletRegistry contract address (as string)
 * @param abi - Contract ABI
 * @param rpcUrl - Optional custom RPC URL (defaults to public RPC for the chain)
 *
 * @example
 * ```ts
 * // Landing page - no viem import needed
 * import { queryRegistryStatusSimple } from '@swr/ui';
 * import { stolenWalletRegistryAbi } from '@swr/abis';
 *
 * const result = await queryRegistryStatusSimple(
 *   84532, // Base Sepolia
 *   '0x123...', // address to check
 *   '0xabc...', // contract address
 *   stolenWalletRegistryAbi
 * );
 * ```
 */
export async function queryRegistryStatusSimple(
  chainId: number,
  address: string,
  contractAddress: string,
  abi: Abi,
  rpcUrl?: string
): Promise<RegistryStatusResult> {
  const chain = CHAIN_CONFIGS[chainId];
  if (!chain) {
    throw new Error(
      `Unsupported chain ID: ${chainId}. Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`
    );
  }

  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  if (!isAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  return queryRegistryStatus(client, address, contractAddress, abi);
}

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
import { base, baseSepolia } from 'viem/chains';
import type { RegistryStatusResult, RegistrationData, AcknowledgementData } from './types';

/** Supported chain configurations */
const CHAIN_CONFIGS: Record<number, Chain> = {
  8453: base,
  84532: baseSepolia,
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

  // Registration data (only valid if isRegistered is true)
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

  // Acknowledgement data (only valid if isPending is true)
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

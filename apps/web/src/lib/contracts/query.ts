/**
 * Contract query utilities for real-time on-chain status checks.
 *
 * This is different from @swr/search which queries the Ponder indexer.
 * Use this for real-time state during registration flows.
 */

import type { PublicClient, Address, Abi, Hash } from 'viem';

/**
 * Registration data from the contract.
 */
export interface RegistrationData {
  registeredAt: bigint;
  sourceChainId: number;
  bridgeId: number;
  isSponsored: boolean;
  crossChainMessageId: Hash;
}

/**
 * Acknowledgement data from the contract.
 */
export interface AcknowledgementData {
  trustedForwarder: Address;
  startBlock: bigint;
  expiryBlock: bigint;
}

/**
 * Combined registry status from contract.
 */
export interface RegistryStatusResult {
  isRegistered: boolean;
  isPending: boolean;
  registrationData: RegistrationData | null;
  acknowledgementData: AcknowledgementData | null;
}

/**
 * Query registry status for a wallet address using multicall.
 *
 * @param client - viem PublicClient
 * @param address - Wallet address to query
 * @param contractAddress - WalletRegistryV2 contract address
 * @param abi - Contract ABI
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
        functionName: 'isWalletRegistered',
        args: [address],
      },
      {
        address: contractAddress,
        abi,
        functionName: 'isWalletPending',
        args: [address],
      },
      {
        address: contractAddress,
        abi,
        functionName: 'getWalletEntry',
        args: [address],
      },
      {
        address: contractAddress,
        abi,
        functionName: 'getAcknowledgementData',
        args: [address],
      },
    ],
  });

  const isRegistered = results[0].status === 'success' ? (results[0].result as boolean) : false;
  const isPending = results[1].status === 'success' ? (results[1].result as boolean) : false;

  let registrationData: RegistrationData | null = null;
  if (results[2].status === 'success' && isRegistered) {
    const result = results[2].result as {
      registeredAt: bigint;
      sourceChainId: number;
      bridgeId: number;
      isSponsored: boolean;
      crossChainMessageId: Hash;
    };
    registrationData = {
      registeredAt: result.registeredAt,
      sourceChainId: result.sourceChainId,
      bridgeId: result.bridgeId,
      isSponsored: result.isSponsored,
      crossChainMessageId: result.crossChainMessageId,
    };
  }

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

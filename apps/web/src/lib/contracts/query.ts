/**
 * Contract query utilities for real-time on-chain status checks.
 *
 * This is different from @swr/search which queries the Ponder indexer.
 * Use this for real-time state during registration flows.
 */

import { parseAbi, type PublicClient, type Address, type Abi } from 'viem';

/**
 * Minimal ABI for isWalletRegistered(address) to avoid viem ambiguity
 * with the string overload isWalletRegistered(string).
 */
const isWalletRegisteredAbi = parseAbi([
  'function isWalletRegistered(address wallet) view returns (bool)',
]);

/**
 * Minimal ABI for getWalletEntry(address) to avoid viem ambiguity
 * with the string overload getWalletEntry(string).
 */
const getWalletEntryAbi = parseAbi([
  'function getWalletEntry(address wallet) view returns ((uint64 registeredAt, uint64 incidentTimestamp, uint32 batchId, uint8 bridgeId, bool isSponsored))',
]);

/**
 * Registration data from the contract (WalletEntry struct).
 */
export interface RegistrationData {
  registeredAt: bigint;
  incidentTimestamp: bigint;
  batchId: number;
  bridgeId: number;
  isSponsored: boolean;
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
 * @param contractAddress - WalletRegistry contract address
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
        abi: isWalletRegisteredAbi,
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
        abi: getWalletEntryAbi,
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
      incidentTimestamp: bigint;
      batchId: number;
      bridgeId: number;
      isSponsored: boolean;
    };
    registrationData = {
      registeredAt: result.registeredAt,
      incidentTimestamp: result.incidentTimestamp,
      batchId: result.batchId,
      bridgeId: result.bridgeId,
      isSponsored: result.isSponsored,
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

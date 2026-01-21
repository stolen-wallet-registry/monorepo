import type { Address, Hex } from 'viem';

export type Network = 'local' | 'testnet' | 'mainnet';
export type RegistryType = 'wallet' | 'transaction' | 'contract';

export interface BaseSubmitOptions {
  file: string;
  network: Network;
  privateKey: string;
  chainId?: number;
  outputDir?: string;
  dryRun?: boolean;
}

export interface SubmissionResult {
  txHash: Hex;
  blockNumber: bigint;
  merkleRoot: Hex;
  entryCount: number;
  gasUsed: bigint;
}

export interface BatchInfo {
  merkleRoot: Hex;
  operator: Address;
  reportedChainId: Hex;
  registeredAt: bigint;
  count: number;
  invalidated: boolean;
}

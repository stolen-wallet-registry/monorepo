import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { NetworkConfig } from './config.js';

export interface ClientPair {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
}

export function createClients(config: NetworkConfig, privateKey: Hex): ClientPair {
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  return {
    publicClient,
    walletClient,
    account: account.address,
  };
}

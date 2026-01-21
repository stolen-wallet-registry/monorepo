import type { Address, Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface NetworkConfig {
  chain: Chain;
  rpcUrl: string;
  contracts: {
    registryHub: Address;
    operatorRegistry: Address;
    stolenWalletRegistry: Address;
    stolenTransactionRegistry: Address;
    fraudulentContractRegistry: Address;
    feeManager: Address;
  };
}

// Local Anvil (development)
export const ANVIL_CONFIG: NetworkConfig = {
  chain: {
    id: 31337,
    name: 'Anvil',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  } as Chain,
  rpcUrl: 'http://127.0.0.1:8545',
  contracts: {
    // These get populated from deployment output
    registryHub: '0x0000000000000000000000000000000000000000' as Address,
    operatorRegistry: '0x0000000000000000000000000000000000000000' as Address,
    stolenWalletRegistry: '0x0000000000000000000000000000000000000000' as Address,
    stolenTransactionRegistry: '0x0000000000000000000000000000000000000000' as Address,
    fraudulentContractRegistry: '0x0000000000000000000000000000000000000000' as Address,
    feeManager: '0x0000000000000000000000000000000000000000' as Address,
  },
};

// Base Sepolia (testnet)
export const BASE_SEPOLIA_CONFIG: NetworkConfig = {
  chain: baseSepolia,
  rpcUrl: 'https://sepolia.base.org',
  contracts: {
    // TODO: Fill after testnet deployment
    registryHub: '0x0000000000000000000000000000000000000000' as Address,
    operatorRegistry: '0x0000000000000000000000000000000000000000' as Address,
    stolenWalletRegistry: '0x0000000000000000000000000000000000000000' as Address,
    stolenTransactionRegistry: '0x0000000000000000000000000000000000000000' as Address,
    fraudulentContractRegistry: '0x0000000000000000000000000000000000000000' as Address,
    feeManager: '0x0000000000000000000000000000000000000000' as Address,
  },
};

// Base (mainnet)
export const BASE_CONFIG: NetworkConfig = {
  chain: base,
  rpcUrl: 'https://mainnet.base.org',
  contracts: {
    // TODO: Fill after mainnet deployment
    registryHub: '0x0000000000000000000000000000000000000000' as Address,
    operatorRegistry: '0x0000000000000000000000000000000000000000' as Address,
    stolenWalletRegistry: '0x0000000000000000000000000000000000000000' as Address,
    stolenTransactionRegistry: '0x0000000000000000000000000000000000000000' as Address,
    fraudulentContractRegistry: '0x0000000000000000000000000000000000000000' as Address,
    feeManager: '0x0000000000000000000000000000000000000000' as Address,
  },
};

export function getConfig(network: 'local' | 'testnet' | 'mainnet'): NetworkConfig {
  switch (network) {
    case 'local':
      return ANVIL_CONFIG;
    case 'testnet':
      return BASE_SEPOLIA_CONFIG;
    case 'mainnet':
      return BASE_CONFIG;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

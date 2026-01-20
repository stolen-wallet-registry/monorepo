import { createConfig } from 'ponder';
import {
  StolenWalletRegistryABI,
  StolenTransactionRegistryABI,
  RegistryHubABI,
  CrossChainInboxABI,
  WalletSoulboundABI,
  SupportSoulboundABI,
  FeeManagerABI,
} from '@swr/abis';
import { anvilHub, baseSepolia, base, type Environment } from '@swr/chains';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
// Set PONDER_ENV to switch environments: development | staging | production
const PONDER_ENV = (process.env.PONDER_ENV ?? 'development') as Environment;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESSES BY ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════
// Anvil addresses are deterministic from DeployCrossChain.s.sol
// Testnet/mainnet addresses are filled after deployment
const ADDRESSES: Record<
  Environment,
  {
    feeManager: `0x${string}`;
    registryHub: `0x${string}`;
    stolenWalletRegistry: `0x${string}`;
    stolenTransactionRegistry: `0x${string}`;
    crossChainInbox: `0x${string}`;
    walletSoulbound: `0x${string}`;
    supportSoulbound: `0x${string}`;
  }
> = {
  development: {
    feeManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    registryHub: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    stolenWalletRegistry: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    stolenTransactionRegistry: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    crossChainInbox: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    walletSoulbound: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e',
    supportSoulbound: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
  },
  staging: {
    // Base Sepolia addresses - fill after deployment
    feeManager: '0x0000000000000000000000000000000000000000',
    registryHub: '0x0000000000000000000000000000000000000000',
    stolenWalletRegistry: '0x0000000000000000000000000000000000000000',
    stolenTransactionRegistry: '0x0000000000000000000000000000000000000000',
    crossChainInbox: '0x0000000000000000000000000000000000000000',
    walletSoulbound: '0x0000000000000000000000000000000000000000',
    supportSoulbound: '0x0000000000000000000000000000000000000000',
  },
  production: {
    // Base mainnet addresses - fill after deployment
    feeManager: '0x0000000000000000000000000000000000000000',
    registryHub: '0x0000000000000000000000000000000000000000',
    stolenWalletRegistry: '0x0000000000000000000000000000000000000000',
    stolenTransactionRegistry: '0x0000000000000000000000000000000000000000',
    crossChainInbox: '0x0000000000000000000000000000000000000000',
    walletSoulbound: '0x0000000000000000000000000000000000000000',
    supportSoulbound: '0x0000000000000000000000000000000000000000',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN CONFIGURATION BY ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════
const CHAIN_CONFIG: Record<
  Environment,
  {
    name: string;
    chainId: number;
    rpc: string;
  }
> = {
  development: {
    name: 'anvilHub',
    chainId: anvilHub.chainId,
    rpc: process.env.PONDER_RPC_URL_31337 ?? 'http://127.0.0.1:8545',
  },
  staging: {
    name: 'baseSepolia',
    chainId: baseSepolia.chainId,
    rpc: process.env.PONDER_RPC_URL_84532!,
  },
  production: {
    name: 'base',
    chainId: base.chainId,
    rpc: process.env.PONDER_RPC_URL_8453!,
  },
};

// Get current config
const chainConfig = CHAIN_CONFIG[PONDER_ENV];
const addresses = ADDRESSES[PONDER_ENV];

// ═══════════════════════════════════════════════════════════════════════════
// PONDER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
export default createConfig({
  chains: {
    [chainConfig.name]: {
      id: chainConfig.chainId,
      rpc: chainConfig.rpc,
    },
  },
  contracts: {
    // Core Registries
    StolenWalletRegistry: {
      chain: chainConfig.name,
      abi: StolenWalletRegistryABI,
      address: addresses.stolenWalletRegistry,
      startBlock: 0,
    },
    StolenTransactionRegistry: {
      chain: chainConfig.name,
      abi: StolenTransactionRegistryABI,
      address: addresses.stolenTransactionRegistry,
      startBlock: 0,
    },
    RegistryHub: {
      chain: chainConfig.name,
      abi: RegistryHubABI,
      address: addresses.registryHub,
      startBlock: 0,
    },

    // Cross-Chain
    CrossChainInbox: {
      chain: chainConfig.name,
      abi: CrossChainInboxABI,
      address: addresses.crossChainInbox,
      startBlock: 0,
    },

    // Soulbound Tokens
    WalletSoulbound: {
      chain: chainConfig.name,
      abi: WalletSoulboundABI,
      address: addresses.walletSoulbound,
      startBlock: 0,
    },
    SupportSoulbound: {
      chain: chainConfig.name,
      abi: SupportSoulboundABI,
      address: addresses.supportSoulbound,
      startBlock: 0,
    },

    // Fee Management (optional - for admin dashboards)
    FeeManager: {
      chain: chainConfig.name,
      abi: FeeManagerABI,
      address: addresses.feeManager,
      startBlock: 0,
    },
  },
});

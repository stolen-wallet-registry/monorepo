import { createConfig } from 'ponder';
import {
  WalletRegistryABI,
  TransactionRegistryABI,
  FraudRegistryHubABI,
  CrossChainInboxABI,
  WalletSoulboundABI,
  SupportSoulboundABI,
  FeeManagerABI,
  OperatorRegistryABI,
  ContractRegistryABI,
} from '@swr/abis';
import { anvilHub, baseSepolia, base, type Environment, type HubContracts } from '@swr/chains';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
// Set PONDER_ENV to switch environments: development | staging | production
const VALID_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
const rawEnv = process.env.PONDER_ENV ?? 'development';

if (!VALID_ENVIRONMENTS.includes(rawEnv as Environment)) {
  throw new Error(
    `Invalid PONDER_ENV: "${rawEnv}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
  );
}

const PONDER_ENV = rawEnv as Environment;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESSES BY ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════
// Source of truth: @swr/chains hubContracts (including soulbound addresses)

/** Hub contracts from @swr/chains (single source of truth) */
const HUB_CONTRACTS: Record<Environment, HubContracts | null> = {
  development: anvilHub.hubContracts,
  staging: baseSepolia.hubContracts,
  production: base.hubContracts,
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
    startBlock: number;
  }
> = {
  development: {
    name: 'anvilHub',
    chainId: anvilHub.chainId,
    rpc: process.env.PONDER_RPC_URL_31337 ?? 'http://127.0.0.1:8545',
    startBlock: 0,
  },
  staging: {
    name: 'baseSepolia',
    chainId: baseSepolia.chainId,
    rpc: process.env.PONDER_RPC_URL_84532 ?? '',
    startBlock: parseInt(process.env.PONDER_START_BLOCK_84532 ?? '0', 10),
  },
  production: {
    name: 'base',
    chainId: base.chainId,
    rpc: process.env.PONDER_RPC_URL_8453 ?? '',
    startBlock: parseInt(process.env.PONDER_START_BLOCK_8453 ?? '0', 10),
  },
};

// Get current config
const chainConfig = CHAIN_CONFIG[PONDER_ENV];
const hubContracts = HUB_CONTRACTS[PONDER_ENV];

// Validate RPC URL for non-development environments
if (PONDER_ENV !== 'development' && !chainConfig.rpc) {
  const envVar = PONDER_ENV === 'staging' ? 'PONDER_RPC_URL_84532' : 'PONDER_RPC_URL_8453';
  throw new Error(`${envVar} is required for ${PONDER_ENV} environment`);
}

// Validate contract addresses for non-development environments
if (PONDER_ENV !== 'development') {
  // Check hub contracts from @swr/chains
  if (!hubContracts) {
    throw new Error(
      `${PONDER_ENV} environment has no hub contracts configured in @swr/chains. ` +
        'Deploy contracts and update network config in packages/chains.'
    );
  }

  // Check soulbound addresses
  const soulboundFields = ['walletSoulbound', 'supportSoulbound'] as const;
  const missingSoulbound = soulboundFields.filter((f) => !hubContracts[f]);
  if (missingSoulbound.length > 0) {
    throw new Error(
      `${PONDER_ENV} environment has unconfigured soulbound addresses: ${missingSoulbound.join(', ')}. ` +
        'Deploy contracts and update network config in packages/chains.'
    );
  }

  // Validate start block is set to avoid full-chain sync
  if (chainConfig.startBlock <= 0) {
    const envVar =
      PONDER_ENV === 'staging' ? 'PONDER_START_BLOCK_84532' : 'PONDER_START_BLOCK_8453';
    throw new Error(
      `${envVar} must be set to the contract deployment block for ${PONDER_ENV} environment. ` +
        'Syncing from block 0 would be extremely slow and costly.'
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PONDER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
export default createConfig({
  chains: {
    [chainConfig.name]: {
      id: chainConfig.chainId,
      rpc: chainConfig.rpc,
      // Disable cache for local dev - anvil resets break cached block data
      // See: https://ponder.sh/docs/guides/foundry
      ...(PONDER_ENV === 'development' && { disableCache: true }),
    },
  },
  contracts: {
    // Core Registries (from @swr/chains hubContracts)
    WalletRegistry: {
      chain: chainConfig.name,
      abi: WalletRegistryABI,
      address: hubContracts!.stolenWalletRegistry,
      startBlock: chainConfig.startBlock,
    },
    TransactionRegistry: {
      chain: chainConfig.name,
      abi: TransactionRegistryABI,
      address: hubContracts!.stolenTransactionRegistry,
      startBlock: chainConfig.startBlock,
    },
    FraudRegistryHub: {
      chain: chainConfig.name,
      abi: FraudRegistryHubABI,
      address: hubContracts!.registryHub,
      startBlock: chainConfig.startBlock,
    },

    // Cross-Chain (from @swr/chains hubContracts)
    CrossChainInbox: {
      chain: chainConfig.name,
      abi: CrossChainInboxABI,
      address: hubContracts!.crossChainInbox!,
      startBlock: chainConfig.startBlock,
    },

    // Soulbound Tokens (from @swr/chains hubContracts)
    WalletSoulbound: {
      chain: chainConfig.name,
      abi: WalletSoulboundABI,
      address: hubContracts!.walletSoulbound!,
      startBlock: chainConfig.startBlock,
    },
    SupportSoulbound: {
      chain: chainConfig.name,
      abi: SupportSoulboundABI,
      address: hubContracts!.supportSoulbound!,
      startBlock: chainConfig.startBlock,
    },

    // Fee Management (from @swr/chains hubContracts)
    FeeManager: {
      chain: chainConfig.name,
      abi: FeeManagerABI,
      address: hubContracts!.feeManager,
      startBlock: chainConfig.startBlock,
    },

    // Operator Registry (from @swr/chains hubContracts)
    OperatorRegistry: {
      chain: chainConfig.name,
      abi: OperatorRegistryABI,
      address: hubContracts!.operatorRegistry!,
      startBlock: chainConfig.startBlock,
    },

    // Fraudulent Contract Registry (from @swr/chains hubContracts)
    ContractRegistry: {
      chain: chainConfig.name,
      abi: ContractRegistryABI,
      address: hubContracts!.fraudulentContractRegistry,
      startBlock: chainConfig.startBlock,
    },
  },
});

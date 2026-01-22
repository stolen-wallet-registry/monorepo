/**
 * Chain configuration types for the Stolen Wallet Registry.
 *
 * Inspired by Aave's networksConfig.ts pattern:
 * https://github.com/aave/interface/blob/main/src/ui-config/networksConfig.ts
 */

// ═══════════════════════════════════════════════════════════════════════════
// ADDRESS TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Ethereum address (0x-prefixed, 42 characters) */
export type Address = `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════
// BRIDGE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/** Supported bridge providers for cross-chain messaging */
export type BridgeProvider = 'hyperlane' | 'wormhole' | 'ccip';

/**
 * Hyperlane-specific bridge configuration.
 * @see https://docs.hyperlane.xyz
 */
export interface HyperlaneBridgeConfig {
  /** Mailbox contract address */
  mailbox: Address;
  /** Interchain Gas Paymaster address */
  igp: Address;
}

/**
 * Wormhole-specific bridge configuration.
 * @see https://docs.wormhole.com
 */
export interface WormholeBridgeConfig {
  /** Core bridge contract address */
  coreBridge?: Address;
  /** Token bridge contract address (if using token transfers) */
  tokenBridge?: Address;
  /** NFT bridge contract address (if using NFT transfers) */
  nftBridge?: Address;
}

/**
 * Chainlink CCIP-specific bridge configuration.
 * @see https://docs.chain.link/ccip
 */
export interface CcipBridgeConfig {
  /** CCIP Router contract address */
  router?: Address;
  /** LINK token address for fee payment */
  linkToken?: Address;
}

/**
 * Bridge provider adapter contract addresses.
 * These are the SWR-deployed adapter contracts that integrate with each bridge.
 */
export interface BridgeAdapters {
  hyperlane?: Address;
  wormhole?: Address;
  ccip?: Address;
}

/**
 * Multi-bridge configuration.
 *
 * Supports multiple bridge providers per chain with a designated primary.
 * This allows chains to have fallback bridges or migrate between providers.
 *
 * @example
 * ```ts
 * bridges: {
 *   primary: 'hyperlane',
 *   hyperlane: { mailbox: '0x...', igp: '0x...' },
 *   wormhole: { coreBridge: '0x...' }, // Optional fallback
 * }
 * ```
 */
export interface BridgesConfig {
  /** Primary bridge provider for cross-chain messages */
  primary: BridgeProvider;
  /** Hyperlane infrastructure addresses */
  hyperlane?: HyperlaneBridgeConfig;
  /** Wormhole infrastructure addresses */
  wormhole?: WormholeBridgeConfig;
  /** Chainlink CCIP infrastructure addresses */
  ccip?: CcipBridgeConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════

/** Hub chain contract addresses */
export interface HubContracts {
  stolenWalletRegistry: Address;
  stolenTransactionRegistry: Address;
  fraudulentContractRegistry: Address;
  feeManager: Address;
  registryHub: Address;
  crossChainInbox?: Address;
  operatorRegistry?: Address;
}

/** Spoke chain contract addresses */
export interface SpokeContracts {
  spokeRegistry: Address;
  feeManager: Address;
  /** Bridge adapter contracts (one per supported provider) */
  bridgeAdapters: BridgeAdapters;
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/** Base network configuration shared by all chains */
interface BaseNetworkConfig {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────
  /** Chain ID (e.g., 84532 for Base Sepolia) */
  chainId: number;
  /** URL-safe slug (e.g., "base-sepolia") */
  name: string;
  /** Human-readable name (e.g., "Base Sepolia") */
  displayName: string;
  /** Path to network logo (e.g., "/icons/networks/base.svg") */
  networkLogoPath?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // NATIVE CURRENCY
  // ─────────────────────────────────────────────────────────────────────────
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RPC CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────
  /** RPC URLs (first is primary, rest are fallbacks) */
  rpcUrls: readonly string[];

  // ─────────────────────────────────────────────────────────────────────────
  // EXPLORER
  // ─────────────────────────────────────────────────────────────────────────
  explorer: {
    name: string;
    url: string;
    apiUrl?: string;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK TIMING
  // ─────────────────────────────────────────────────────────────────────────
  blockTiming: {
    /** Average block time in seconds */
    blockTimeSeconds: number;
    /** Grace period blocks for registration */
    graceBlocks: number;
    /** Deadline blocks for registration window */
    deadlineBlocks: number;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // BRIDGE INFRASTRUCTURE
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Cross-chain bridge configuration.
   * Supports multiple bridge providers with a designated primary.
   */
  bridges?: BridgesConfig;

  // ─────────────────────────────────────────────────────────────────────────
  // PRICE FEED
  // ─────────────────────────────────────────────────────────────────────────
  priceFeed: {
    /** Chainlink ETH/USD feed address (null = deploy mock) */
    chainlinkFeed: Address | null;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FLAGS
  // ─────────────────────────────────────────────────────────────────────────
  /** Whether this is a testnet */
  isTestnet: boolean;
  /** Whether this is a local development chain */
  isLocal: boolean;
}

/** Hub network configuration (where registrations settle) */
export interface HubNetworkConfig extends BaseNetworkConfig {
  role: 'hub';
  /** Hub chains don't have a parent hub */
  hubChainId?: never;
  /** Hub contract addresses (null if not deployed) */
  hubContracts: HubContracts | null;
  /** Hub chains don't have spoke contracts */
  spokeContracts?: never;
}

/** Spoke network configuration (bridges to hub) */
export interface SpokeNetworkConfig extends BaseNetworkConfig {
  role: 'spoke';
  /** The hub chain ID this spoke bridges to */
  hubChainId: number;
  /** Spoke chains don't have hub contracts */
  hubContracts?: never;
  /** Spoke contract addresses (null if not deployed) */
  spokeContracts: SpokeContracts | null;
}

/** Union type for any network configuration */
export type NetworkConfig = HubNetworkConfig | SpokeNetworkConfig;

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Deployment environment */
export type Environment = 'development' | 'staging' | 'production';

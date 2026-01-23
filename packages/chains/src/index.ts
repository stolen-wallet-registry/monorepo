/**
 * @swr/chains - Unified chain configuration for the Stolen Wallet Registry.
 *
 * Single source of truth for all chain-specific data:
 * - Network configurations (RPC, explorers, block timing)
 * - Contract addresses (hub and spoke)
 * - Multi-bridge infrastructure (Hyperlane, Wormhole, CCIP)
 * - Chain role detection (hub vs spoke)
 * - Environment-based chain selection
 *
 * @example
 * ```typescript
 * import {
 *   networks,
 *   toWagmiChain,
 *   isHubChain,
 *   getBlockTime,
 *   getHyperlaneMailbox,
 *   getPrimaryBridgeProvider,
 * } from '@swr/chains';
 *
 * // Get network config
 * const baseConfig = networks[84532]; // Base Sepolia
 *
 * // Convert to wagmi Chain
 * const wagmiChain = toWagmiChain(baseConfig);
 *
 * // Check chain role
 * if (isHubChain(chainId)) {
 *   // Use hub contracts
 * }
 *
 * // Get block timing
 * const blockTime = getBlockTime(chainId); // 2 for Base
 *
 * // Bridge configuration
 * const primary = getPrimaryBridgeProvider(chainId); // 'hyperlane'
 * const mailbox = getHyperlaneMailbox(chainId); // '0x...'
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type {
  Address,
  BridgeProvider,
  // Bridge configs
  HyperlaneBridgeConfig,
  WormholeBridgeConfig,
  CcipBridgeConfig,
  BridgeAdapters,
  BridgesConfig,
  // Contracts
  HubContracts,
  SpokeContracts,
  // Network configs
  HubNetworkConfig,
  SpokeNetworkConfig,
  NetworkConfig,
  Environment,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// NETWORKS
// ═══════════════════════════════════════════════════════════════════════════

// Individual network exports
export {
  anvilHub,
  anvilSpoke,
  arbitrum,
  base,
  baseSepolia,
  ethereum,
  optimism,
  optimismSepolia,
} from './networks';

// Network lookup and utilities
export {
  allNetworks,
  networks,
  getNetwork,
  getNetworkOrUndefined,
  isSupportedChain,
  getSupportedChainIds,
} from './networks';

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Block utilities
export {
  getBlockTime,
  getGraceBlocks,
  getDeadlineBlocks,
  estimateTimeFromBlocks,
  estimateBlocksFromTime,
  formatTimeRemaining,
  formatTimeString,
  blocksRemaining,
  type TimeRemaining,
  type FormatTimeStringOptions,
} from './utils';

// Explorer utilities
export {
  getExplorerAddressUrl,
  getExplorerTxUrl,
  getExplorerName,
  getChainName,
  getChainShortName,
  getBridgeExplorerName,
  getBridgeMessageUrl,
  getBridgeMessageByIdUrl,
} from './utils';

// Role utilities
export {
  isHubChain,
  isSpokeChain,
  isLocalChain,
  isTestnet,
  getHubChainId,
  getSpokeChainIds,
  getHubChains,
  getSpokeChains,
  getLocalChains,
  getLocalChainIds,
  getTestnetChains,
  getMainnetChains,
} from './utils';

// wagmi utilities
export {
  toWagmiChain,
  toWagmiChainById,
  getWagmiChains,
  getAllWagmiChains,
  getRpcUrl,
  getRpcUrls,
} from './utils';

// Bridge utilities
export {
  getPrimaryBridgeProvider,
  getSupportedBridgeProviders,
  isBridgeProviderSupported,
  hasBridgeSupport,
  getHyperlaneConfig,
  getHyperlaneMailbox,
  getHyperlaneIgp,
  getWormholeConfig,
  getCcipConfig,
  getBridgeAdapterAddress,
  getBridgeAdapterAddressOrNull,
  getAllBridgeAdapters,
} from './utils';

// CAIP-2 / CAIP-10 utilities
export {
  // Lookup tables
  CAIP2_LOOKUP,
  HYPERLANE_DOMAIN_TO_CAIP2,
  CAIP2_CHAIN_NAMES,
  // CAIP-2 functions
  resolveChainIdHash,
  caip2ToNumericChainId,
  toCAIP2,
  hyperlaneDomainToCAIP2,
  getCAIP2ChainName,
  computeCAIP2Hash,
  // CAIP-10 functions
  toCAIP10,
  toCAIP10FromCAIP2,
  parseCAIP10,
  extractAddressFromCAIP10,
  extractCAIP2FromCAIP10,
} from './utils';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  environmentChainIds,
  hubChainIds,
  environmentNetworks,
  getEnvironmentChainIds,
  getHubChainIdForEnvironment,
  getEnvironmentNetworks,
  detectEnvironmentFromChainId,
} from './environments';

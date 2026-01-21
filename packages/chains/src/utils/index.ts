/**
 * Utility function exports.
 */

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
} from './blocks';

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
} from './explorers';

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
} from './roles';

// wagmi utilities
export {
  toWagmiChain,
  toWagmiChainById,
  getWagmiChains,
  getAllWagmiChains,
  getRpcUrl,
  getRpcUrls,
} from './wagmi';

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
} from './bridges';

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
} from './caip';

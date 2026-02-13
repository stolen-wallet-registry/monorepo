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

// Contract address getters
export {
  type RegistryType,
  type RegistryVariant,
  getWalletRegistryAddress,
  getTransactionRegistryAddress,
  getContractRegistryAddress,
  getFraudRegistryHubAddress,
  getOperatorSubmitterAddress,
  getCrossChainInboxAddress,
  getOperatorRegistryAddress,
  getFeeManagerAddress,
  getTranslationRegistryAddress,
  getWalletSoulboundAddress,
  getSupportSoulboundAddress,
  getSoulboundReceiverAddress,
  getSpokeRegistryAddress,
  getSpokeFeeManagerAddress,
  getSpokeSoulboundForwarderAddress,
  getRegistryAddress,
  getRegistryType,
} from './contracts';

// CAIP-2 / CAIP-10 utilities
export {
  // Types (re-exported from @swr/caip)
  type CAIP2,
  type CAIP10,
  type ChainNamespace,
  type ParsedCAIP2,
  type ParsedCAIP10,
  // Lookup tables (chain-specific)
  CAIP2_LOOKUP,
  HYPERLANE_DOMAIN_TO_CAIP2,
  CAIP2_CHAIN_NAMES,
  // CAIP-2 functions (re-exported from @swr/caip)
  toCAIP2,
  parseCAIP2,
  isValidCAIP2,
  caip2ToNumericChainId,
  // CAIP-10 functions (re-exported from @swr/caip)
  toCAIP10,
  toCAIP10FromCAIP2,
  parseCAIP10,
  isValidCAIP10,
  extractAddressFromCAIP10,
  extractCAIP2FromCAIP10,
  // bytes32 conversions (re-exported from @swr/caip)
  computeCAIP2Hash,
  chainIdToBytes32,
  caip2ToBytes32,
  // Lookup functions (chain-specific)
  resolveChainIdHash,
  hyperlaneDomainToCAIP2,
  getCAIP2ChainName,
  bytes32ToCAIP2,
} from './caip';

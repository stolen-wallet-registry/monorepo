// Contract read hooks
export {
  useContractDeadlines,
  type DeadlineData,
  type UseContractDeadlinesResult,
} from './useContractDeadlines';

export { useContractNonce, type UseContractNonceResult } from './useContractNonce';

export {
  useGenerateHashStruct,
  type HashStructData,
  type UseGenerateHashStructResult,
} from './useGenerateHashStruct';

export { useQuoteRegistration, type UseQuoteRegistrationResult } from './useQuoteRegistration';

export { useQuoteFeeBreakdown, type UseQuoteFeeBreakdownResult } from './useQuoteFeeBreakdown';

// Contract write hooks
export {
  useAcknowledgement,
  type AcknowledgementParams,
  type UseAcknowledgementResult,
} from './useAcknowledgement';

export {
  useRegistration,
  type RegistrationParams,
  type UseRegistrationResult,
} from './useRegistration';

// Signing hooks
export { useSignEIP712, type SignParams, type UseSignEIP712Result } from './useSignEIP712';

// Timer hooks
export {
  useCountdownTimer,
  type UseCountdownTimerOptions,
  type UseCountdownTimerResult,
} from './useCountdownTimer';

// Navigation hooks
export { useStepNavigation, type UseStepNavigationResult } from './useStepNavigation';

// P2P hooks
export {
  useP2PConnection,
  type UseP2PConnectionOptions,
  type UseP2PConnectionResult,
} from './useP2PConnection';

export {
  useP2PSignatureRelay,
  type UseP2PSignatureRelayOptions,
  type UseP2PSignatureRelayResult,
  type P2PRole,
} from './useP2PSignatureRelay';

export {
  useP2PKeepAlive,
  type UseP2PKeepAliveOptions,
  type UseP2PKeepAliveResult,
} from './useP2PKeepAlive';

export {
  useP2PConnectionHealth,
  type UseP2PConnectionHealthOptions,
  type UseP2PConnectionHealthResult,
  type ConnectionHealth,
  type ConnectionStatus,
} from './useP2PConnectionHealth';

// Utility hooks
export { useCopyToClipboard, type UseCopyToClipboardResult } from './useCopyToClipboard';

// Registry status hook
export {
  useRegistryStatus,
  type RegistryStatus,
  type RegistrationData,
  type AcknowledgementData,
  type UseRegistryStatusOptions,
} from './useRegistryStatus';

// Cross-chain confirmation
export {
  useCrossChainConfirmation,
  needsCrossChainConfirmation,
  type CrossChainStatus,
  type UseCrossChainConfirmationOptions,
  type UseCrossChainConfirmationResult,
} from './useCrossChainConfirmation';

// Soulbound token hooks
export {
  useHasMinted,
  useCanMint,
  useMinDonation,
  useMintWalletSoulbound,
  useMintSupportSoulbound,
  type UseHasMintedResult,
  type UseHasMintedOptions,
  type UseCanMintResult,
  type UseCanMintOptions,
  type UseMinDonationResult,
  type UseMinDonationOptions,
  type UseMintWalletSoulboundResult,
  type MintWalletSoulboundParams,
  type UseMintSupportSoulboundResult,
  type MintSupportSoulboundParams,
} from './soulbound';

// Indexer hooks (Ponder GraphQL)
export {
  useRegistrySearch,
  useSearchType,
  detectSearchType,
  type SearchType,
  type SearchResult,
  type WalletSearchResult,
  type TransactionSearchResult,
  type WalletSearchData,
  type TransactionSearchData,
} from './indexer';

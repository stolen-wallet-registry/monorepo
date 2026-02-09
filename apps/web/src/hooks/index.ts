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
  useP2PSignatureRelay,
  type UseP2PSignatureRelayOptions,
  type UseP2PSignatureRelayResult,
  type P2PRole,
  useP2PKeepAlive,
  type UseP2PKeepAliveOptions,
  type UseP2PKeepAliveResult,
  useP2PConnectionHealth,
  type UseP2PConnectionHealthOptions,
  type UseP2PConnectionHealthResult,
  type ConnectionHealth,
  type ConnectionStatus,
} from './p2p';

// Utility hooks
export { useCopyToClipboard, type UseCopyToClipboardResult } from './useCopyToClipboard';

export { useWalletType, type WalletType, type UseWalletTypeResult } from './useWalletType';

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
  // Address (combined wallet + contract)
  type AddressSearchData,
  type AddressSearchResult,
  // Wallet (internal)
  type WalletSearchResult,
  type WalletSearchData,
  // Contract
  type ContractSearchData,
  type ContractChainReport,
  // Transaction
  type TransactionSearchResult,
  type TransactionSearchData,
  type TransactionChainReport,
} from './indexer';

// ENS hooks
export {
  useEnsDisplay,
  useEnsResolve,
  type EnsDisplayData,
  type UseEnsDisplayOptions,
  type EnsResolveResult,
} from './ens';

// Dashboard hooks
export {
  // Role hooks
  useIsOperator,
  useIsDAO,
  useUserRole,
  type UserRole,
  type UseIsOperatorOptions,
  type UseIsOperatorResult,
  type UseIsDAOOptions,
  type UseIsDAOResult,
  type UseUserRoleOptions,
  type UseUserRoleResult,
  // Data hooks
  useRegistryStats,
  useOperators,
  useRecentRegistrations,
  type RegistryStats,
  type UseRegistryStatsResult,
  type OperatorInfo,
  type UseOperatorsResult,
  type RegistrationEntry,
  type RegistrationType,
  type UseRecentRegistrationsOptions,
  type UseRecentRegistrationsResult,
} from './dashboard';

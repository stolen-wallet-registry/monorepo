// Composed components barrel export
export { GracePeriodTimer, type GracePeriodTimerProps } from './GracePeriodTimer';
export {
  StepIndicator,
  type StepIndicatorProps,
  type StepConfig,
  type StepStatus,
} from './StepIndicator';
export {
  RegistrationMethodSelector,
  type RegistrationMethodSelectorProps,
  type MethodConfig,
} from './RegistrationMethodSelector';
export {
  SignatureCard,
  type SignatureCardProps,
  type SignatureData,
  type SignatureStatus,
} from './SignatureCard';
export {
  TransactionCard,
  type TransactionCardProps,
  type TransactionStatus,
} from './TransactionCard';
export {
  WalletSwitchPrompt,
  type WalletSwitchPromptProps,
  type WalletStatus,
} from './WalletSwitchPrompt';
export {
  RegistrySearch,
  type RegistrySearchProps,
  RegistrySearchResult,
  type RegistrySearchResultProps,
  type ResultStatus,
  AddressSearchResult,
  type AddressSearchResultProps,
} from './RegistrySearch';
export { ConnectedWalletStatus, type ConnectedWalletStatusProps } from './ConnectedWalletStatus';
export { ChainIndicator, type ChainIndicatorProps } from './ChainIndicator';
export { ChainIcon, type ChainIconProps, type ChainIconSize } from './ChainIcon';

// Transaction components
export { TransactionSelector, type TransactionSelectorProps } from './TransactionSelector';
export {
  TransactionStepIndicator,
  type TransactionStepIndicatorProps,
} from './TransactionStepIndicator';

// Soulbound components
export { LanguageSelector, type LanguageSelectorProps } from './LanguageSelector';
export {
  WalletSoulboundMintCard,
  type WalletSoulboundMintCardProps,
} from './WalletSoulboundMintCard';
export {
  SupportSoulboundMintCard,
  type SupportSoulboundMintCardProps,
} from './SupportSoulboundMintCard';
export { SoulboundSvgPreview, type SoulboundSvgPreviewProps } from '@swr/ui';
export { SoulboundPreviewModal, type SoulboundPreviewModalProps } from './SoulboundPreviewModal';
export { MintedTokenDisplay, type MintedTokenDisplayProps } from './MintedTokenDisplay';

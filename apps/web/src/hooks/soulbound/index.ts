/**
 * Soulbound token hooks for minting and querying soulbound NFTs.
 */

// Read hooks
export { useHasMinted, type UseHasMintedResult, type UseHasMintedOptions } from './useHasMinted';
export { useCanMint, type UseCanMintResult, type UseCanMintOptions } from './useCanMint';
export {
  useMinDonation,
  type UseMinDonationResult,
  type UseMinDonationOptions,
} from './useMinDonation';
export {
  useTokenURI,
  type UseTokenURIResult,
  type UseTokenURIOptions,
  type TokenMetadata,
} from './useTokenURI';
export {
  useWalletTokenId,
  type UseWalletTokenIdResult,
  type UseWalletTokenIdOptions,
} from './useWalletTokenId';
export {
  useSupportTokens,
  type UseSupportTokensResult,
  type UseSupportTokensOptions,
} from './useSupportTokens';

// Write hooks (direct hub mint)
export {
  useMintWalletSoulbound,
  type UseMintWalletSoulboundResult,
  type MintWalletSoulboundParams,
} from './useMintWalletSoulbound';
export {
  useMintSupportSoulbound,
  type UseMintSupportSoulboundResult,
  type MintSupportSoulboundParams,
} from './useMintSupportSoulbound';

// Cross-chain mint hooks (spoke → hub)
export {
  useQuoteCrossChainMintFee,
  type UseQuoteCrossChainMintFeeResult,
  type CrossChainMintFee,
} from './useQuoteCrossChainMintFee';
export {
  useCrossChainWalletMint,
  type UseCrossChainWalletMintResult,
  type CrossChainWalletMintParams,
} from './useCrossChainWalletMint';
export {
  useCrossChainSupportMint,
  type UseCrossChainSupportMintResult,
  type CrossChainSupportMintParams,
} from './useCrossChainSupportMint';
export {
  useCrossChainMintGasEstimate,
  type UseCrossChainMintGasEstimateResult,
  type UseCrossChainMintGasEstimateParams,
  type CrossChainMintGasEstimate,
} from './useCrossChainMintGasEstimate';
export {
  useCrossChainSoulboundConfirmation,
  type UseCrossChainSoulboundConfirmationOptions,
  type UseCrossChainSoulboundConfirmationResult,
  type SoulboundConfirmationStatus,
} from './useCrossChainSoulboundConfirmation';

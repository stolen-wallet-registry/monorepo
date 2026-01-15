/**
 * Soulbound token hooks for minting and querying soulbound NFTs.
 */

// Read hooks
export {
  useSupportedLanguages,
  type UseSupportedLanguagesResult,
  type UseSupportedLanguagesOptions,
} from './useSupportedLanguages';
export { useHasMinted, type UseHasMintedResult, type UseHasMintedOptions } from './useHasMinted';
export { useCanMint, type UseCanMintResult, type UseCanMintOptions } from './useCanMint';
export {
  useMinDonation,
  type UseMinDonationResult,
  type UseMinDonationOptions,
} from './useMinDonation';

// Write hooks
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

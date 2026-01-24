/**
 * Fee-related types for registration cost display.
 */

/**
 * Individual fee line item with multiple format representations.
 */
export interface FeeLineItem {
  /** Fee amount in wei (BigInt for precision) */
  wei: bigint;
  /** Fee amount formatted as ETH string (e.g., "0.001666") */
  eth: string;
  /** Fee amount formatted as USD string (e.g., "$5.00") */
  usd: string;
}

/**
 * Complete fee breakdown for registration.
 * On spoke chains, includes bridge fee from Hyperlane/CCIP/Wormhole.
 * On hub chain, bridgeFee and bridgeName will be null.
 */
export interface FeeBreakdown {
  /** Cross-chain bridge fee (null on hub chain) */
  bridgeFee: FeeLineItem | null;
  /** Protocol registration fee from FeeManager */
  registrationFee: FeeLineItem;
  /** Combined total (bridgeFee + registrationFee) */
  total: FeeLineItem;
  /** Bridge name from adapter ("Hyperlane", "CCIP", "Wormhole") - null on hub */
  bridgeName: string | null;
  /** True if this is a cross-chain registration (spoke → hub) */
  isCrossChain: boolean;
}

/**
 * Raw fee breakdown from contract (before formatting).
 * Matches ISpokeRegistry.FeeBreakdown struct.
 */
export interface RawFeeBreakdown {
  bridgeFee: bigint;
  registrationFee: bigint;
  total: bigint;
  bridgeName: string;
}

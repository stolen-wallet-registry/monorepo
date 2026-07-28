/**
 * Shared prop groups for the soulbound mint action components.
 *
 * The wallet and support cards drive the same three-shape mint region, so they take the
 * same inputs. Grouping them keeps the two action components' signatures in sync and
 * keeps related flags travelling together instead of as a flat wall of booleans.
 */

/**
 * Which chain the wallet is on, relative to the hub.
 *
 * The two names and the two flags are always read together to pick which of the three
 * mutually exclusive shapes renders, so they are one value rather than four props.
 */
export interface MintChainContext {
  hubChainName: string;
  currentChainName: string;
  isOnHubChain: boolean;
  isOnSpokeChain: boolean;
}

/**
 * Lifecycle of one mint transaction. Used for both the hub and cross-chain paths.
 *
 * The flags are phases of a single transaction, not independent switches - grouping them
 * means the two paths reuse one shape instead of duplicating five prefixed props each.
 */
export interface MintTxState {
  isPending: boolean;
  isConfirming: boolean;
  isMinting: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Cost inputs for the cross-chain fee breakdown.
 *
 * Fee, gas and ETH price are only consumed by the breakdown, and only on a spoke chain,
 * so they stay one bundle that is forwarded as a unit.
 */
export interface MintCostEstimate {
  fee: { feeEth: string } | null | undefined;
  isLoadingFee: boolean;
  isFeeError: boolean;
  feeError: { message?: string } | null | undefined;
  gas: { gasCostEth: string; gasCostUsd: number } | null | undefined;
  isLoadingGas: boolean;
  /** ETH price in USD, 0 when unknown */
  ethPrice: number;
}

/**
 * Search types for the Stolen Wallet Registry.
 *
 * These types represent the data returned by the Ponder indexer,
 * which provides richer metadata than direct contract queries.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ETHEREUM PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

/** Ethereum address (0x + 40 hex chars) */
export type Address = `0x${string}`;

/** Transaction/block hash (0x + 64 hex chars) */
export type Hash = `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type of search input detected.
 */
export type SearchType = 'wallet' | 'transaction' | 'caip10' | 'invalid';

// ═══════════════════════════════════════════════════════════════════════════
// WALLET SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data for a stolen wallet from the indexer.
 */
export interface WalletSearchData {
  /** Wallet address (lowercase) */
  address: Address;
  /** CAIP-10 identifier (e.g., "eip155:8453:0x...") */
  caip10: string;
  /** Timestamp when registered (Unix seconds as bigint) */
  registeredAt: bigint;
  /** Transaction hash of registration */
  transactionHash: Hash;
  /** Whether registration was sponsored by another wallet */
  isSponsored: boolean;
  /** Source chain CAIP-2 ID (for cross-chain registrations) */
  sourceChainCAIP2?: string;
  /** Human-readable source chain name */
  sourceChainName?: string;
}

/**
 * Result of a wallet search.
 */
export interface WalletSearchResult {
  type: 'wallet';
  found: boolean;
  data: WalletSearchData | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chain-specific report for a fraudulent transaction.
 */
export interface TransactionChainReport {
  /** CAIP-2 chain ID (e.g., "eip155:8453") */
  caip2ChainId: string;
  /** Human-readable chain name */
  chainName: string;
  /** Numeric chain ID (if EVM) */
  numericChainId?: number;
  /** Batch ID this transaction belongs to */
  batchId: Hash;
  /** Address that reported the transaction */
  reporter: Address;
  /** Timestamp when reported (Unix seconds as bigint) */
  reportedAt: bigint;
}

/**
 * Data for a reported fraudulent transaction.
 */
export interface TransactionSearchData {
  /** Transaction hash */
  txHash: Hash;
  /** Reports across different chains */
  chains: TransactionChainReport[];
}

/**
 * Result of a transaction search.
 */
export interface TransactionSearchResult {
  type: 'transaction';
  found: boolean;
  data: TransactionSearchData | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED SEARCH RESULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result when search input is invalid.
 */
export interface InvalidSearchResult {
  type: 'invalid';
  found: false;
  data: null;
}

/**
 * Union of all search result types.
 */
export type SearchResult = WalletSearchResult | TransactionSearchResult | InvalidSearchResult;

// ═══════════════════════════════════════════════════════════════════════════
// STATUS INTERPRETATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simplified status for display.
 */
export type ResultStatus = 'registered' | 'pending' | 'not-found';

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH CONFIG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for search functions.
 */
export interface SearchConfig {
  /** Ponder indexer URL */
  indexerUrl: string;
}

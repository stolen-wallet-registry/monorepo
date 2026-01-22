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
export type SearchType = 'address' | 'transaction' | 'caip10' | 'invalid';

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
// CONTRACT DATA (used in combined address search)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chain-specific report for a fraudulent contract.
 */
export interface ContractChainReport {
  /** CAIP-2 chain ID (e.g., "eip155:8453") */
  caip2ChainId: string;
  /** Human-readable chain name */
  chainName: string;
  /** Numeric chain ID (if EVM) */
  numericChainId?: number;
  /** Batch ID this contract belongs to */
  batchId: Hash;
  /** Operator who submitted */
  operator: Address;
  /** Timestamp when reported (Unix seconds as bigint) */
  reportedAt: bigint;
  /** Whether entry is invalidated */
  isInvalidated: boolean;
}

/**
 * Data for a reported fraudulent contract.
 */
export interface ContractSearchData {
  /** Contract address */
  contractAddress: Address;
  /** Reports across different chains */
  chains: ContractChainReport[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ADDRESS SEARCH (combined wallet + contract lookup)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combined result when searching an address.
 * Checks BOTH stolen wallet registry AND fraudulent contract registry.
 */
export interface AddressSearchData {
  /** The searched address */
  address: Address;
  /** Wallet data if found in stolen wallet registry */
  wallet: WalletSearchData | null;
  /** Contract data if found in fraudulent contract registry */
  contract: ContractSearchData | null;
}

/**
 * Result of an address search (unified across registries).
 */
export interface AddressSearchResult {
  type: 'address';
  /** True if found in EITHER wallet OR contract registry */
  found: boolean;
  /** Found in stolen wallet registry */
  foundInWalletRegistry: boolean;
  /** Found in fraudulent contract registry */
  foundInContractRegistry: boolean;
  data: AddressSearchData | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATOR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data for a DAO-approved operator.
 */
export interface OperatorData {
  /** Operator address */
  address: Address;
  /** Human-readable identifier */
  identifier: string;
  /** Capabilities bitmask */
  capabilities: number;
  /** Is currently approved */
  approved: boolean;
  /** Can submit to wallet registry */
  canSubmitWallet: boolean;
  /** Can submit to transaction registry */
  canSubmitTransaction: boolean;
  /** Can submit to contract registry */
  canSubmitContract: boolean;
  /** Block number when approved */
  approvedAt: bigint;
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
export type SearchResult = AddressSearchResult | TransactionSearchResult | InvalidSearchResult;

// Legacy types for backward compatibility
export type WalletSearchResultLegacy = WalletSearchResult;

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

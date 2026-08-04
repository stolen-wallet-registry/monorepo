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

/** Generic 0x-prefixed hex string of unspecified length */
export type Hex = `0x${string}`;

/**
 * A registry batch identifier.
 *
 * Deliberately NOT {@link Hash}. Batch IDs are `uint256` on chain and the indexer stores
 * `batchId.toString()` into a text column, so the value here is a DECIMAL string ("5"), not
 * hex. Typing it as `Hash` told every consumer it could be passed to `truncateHash` or any
 * other hex-expecting helper, which silently rendered "5" as an address-shaped value.
 */
export type BatchId = string;

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type of search input detected.
 *
 * `'invalid'` and `'unsupported'` are deliberately distinct, and conflating them is a
 * fail-open bug:
 *
 * - `'invalid'` — this is not an identifier at all (a typo, a name, a truncated hex string).
 *   Nothing was queried and nothing needed to be; there is no registry answer to miss.
 * - `'unsupported'` — this IS a well-formed identifier, for a namespace this registry cannot
 *   currently answer for (`solana:…`, `bip122:…`). The address may well be registered; we
 *   simply have no way to look. Reporting that as `'invalid'` (and therefore as a negative
 *   result) is how an off-ramp clears a wallet the registry genuinely cannot speak to.
 *   {@link SearchType} `'unsupported'` never produces a result — `search()` throws.
 */
export type SearchType = 'address' | 'transaction' | 'caip10' | 'unsupported' | 'invalid';

/**
 * A registry a search can consult.
 */
export type RegistryKind = 'wallet' | 'contract' | 'transaction';

/**
 * Registries that could NOT be consulted for a given search.
 *
 * This exists so that `found: false` can never be read as "clean" on its own. For a fraud
 * registry a false negative is the most dangerous possible answer — an off-ramp clearing a
 * wallet that IS registered stolen — so every result states which registries actually
 * answered. When a registry is listed here, `found: false` means only "absent from the
 * registries that answered", and the caller must say "could not verify", never "clean".
 *
 * A search that finds nothing AND cannot reach a registry does not return at all: it throws
 * {@link SearchUnavailableError}, because a flag on a returned value can be ignored while an
 * exception cannot.
 */
export type UnverifiedRegistries = readonly RegistryKind[];

/**
 * The only coverage a NEGATIVE result may carry: none missing.
 *
 * Every `found: false` member of every result type is typed with this rather than
 * {@link UnverifiedRegistries}, which makes "nothing found, and by the way a registry did not
 * answer" *unrepresentable*. That combination is the false-clean this package exists to
 * prevent, and it now has no shape to inhabit — the only way to express it is to throw
 * {@link SearchUnavailableError}, which a caller cannot mistake for a clean result.
 *
 * A POSITIVE result still uses {@link UnverifiedRegistries}: a hit is actionable even when
 * the other registry is down, so it returns with the gap stated.
 */
export type NoUnverifiedRegistries = readonly [];

// ═══════════════════════════════════════════════════════════════════════════
// WALLET SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data for a stolen wallet from the indexer.
 */
export interface WalletSearchData {
  /**
   * Wallet address (lowercase), or `null` when the entry has no address form.
   *
   * Nullable on purpose. The registry keys wallets by a full `bytes32` identifier, and only
   * eip155 entries fit an address; a Solana or Bitcoin entry occupies all 32 bytes. This used
   * to be typed `Address` and fall back to the 66-char identifier, so a consumer running
   * `isAddress(data.address)` on a genuine hit got `false` from a type that promised
   * otherwise. Use {@link identifier} when you need the value that is always present.
   */
  address: Address | null;
  /**
   * The registry's full `bytes32` storage key for this entry, lowercase.
   *
   * Always populated by this package — it is the row's primary key. Optional in the type only
   * so hand-built fixtures and stories need not supply it; do not read it as "may be absent
   * from a real search result".
   */
  identifier?: Hex;
  /**
   * CAIP-10 identifier. EVM wallets use the wildcard chain reference
   * ("eip155:*:0x…") because the registry's wallet key is chain-wildcarded — a wallet
   * marked stolen is stolen on every EVM chain. See `reportedChainCAIP2` for the chain the
   * incident was reported on.
   */
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
  /** CAIP-2 chain the incident was reported on */
  reportedChainCAIP2?: string;
  /** Human-readable reported chain name */
  reportedChainName?: string;
}

/**
 * Result of a wallet search.
 *
 * A discriminated union on `found`, so the two states that produce a false clean cannot be
 * built at all:
 *
 * - `found: true` with `data: null` — a caller guarding `if (found && data)` skips the
 *   dangerous branch and falls through to whatever it renders for "nothing here".
 * - `found: false` with a non-empty `unverified` — see {@link NoUnverifiedRegistries}.
 */
export type WalletSearchResult =
  | {
      type: 'wallet';
      found: true;
      /** Non-null by construction: a hit always carries its data. */
      data: WalletSearchData;
      /** Registries that could not be consulted. See {@link UnverifiedRegistries}. */
      unverified: UnverifiedRegistries;
    }
  | {
      type: 'wallet';
      found: false;
      data: null;
      /** Always empty. See {@link NoUnverifiedRegistries}. */
      unverified: NoUnverifiedRegistries;
    };

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
  /** Batch ID this transaction belongs to (null when not yet linked). Decimal, not hex. */
  batchId: BatchId | null;
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
  /**
   * True when the indexer had MORE reports than {@link chains} contains.
   *
   * `chains.length` is quoted verbatim in user-facing copy ("reported as fraudulent on N
   * chains"), so a silently truncated list under-reports how widely a transaction is flagged.
   * `found` is never affected — this is a completeness signal, not a safety one — but a
   * caller rendering the count should say "N+" when this is set.
   */
  chainsTruncated?: boolean;
}

/**
 * Result of a transaction search.
 *
 * Same union shape as {@link WalletSearchResult}, for the same reason.
 */
export type TransactionSearchResult =
  | {
      type: 'transaction';
      found: true;
      /** Non-null by construction: a hit always carries its data. */
      data: TransactionSearchData;
      /** Registries that could not be consulted. See {@link UnverifiedRegistries}. */
      unverified: UnverifiedRegistries;
    }
  | {
      type: 'transaction';
      found: false;
      data: null;
      /** Always empty. See {@link NoUnverifiedRegistries}. */
      unverified: NoUnverifiedRegistries;
    };

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
  /** Batch ID this contract belongs to. Decimal, not hex. */
  batchId: BatchId;
  /** Operator who submitted */
  operator: Address;
  /** Timestamp when reported (Unix seconds as bigint) */
  reportedAt: bigint;
}

/**
 * Data for a reported fraudulent contract.
 */
export interface ContractSearchData {
  /** Contract address */
  contractAddress: Address;
  /** Reports across different chains */
  chains: ContractChainReport[];
  /**
   * True when the indexer had MORE reports than {@link chains} contains.
   *
   * See {@link TransactionSearchData.chainsTruncated} — same contract, same reason. This one
   * feeds `getAddressStatusDescription`'s "Flagged as a fraudulent contract on N chains".
   */
  chainsTruncated?: boolean;
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
 *
 * A discriminated union on `found`. The positive member carries non-null `data`; the negative
 * member pins every "found in X" flag to `false`, `data` to `null`, and `unverified` to empty.
 * Between them there is no way to construct a result that reads as clean while being anything
 * else — see {@link NoUnverifiedRegistries}.
 *
 * Invariant not expressible here but held by the implementation: when `found` is true, at
 * least one of `foundInWalletRegistry` / `foundInContractRegistry` is true.
 */
export type AddressSearchResult =
  | {
      type: 'address';
      /** True if found in EITHER wallet OR contract registry */
      found: true;
      /** Found in stolen wallet registry */
      foundInWalletRegistry: boolean;
      /** Found in fraudulent contract registry */
      foundInContractRegistry: boolean;
      /** Non-null by construction: a hit always carries its data. */
      data: AddressSearchData;
      /**
       * Registries that could not be consulted. See {@link UnverifiedRegistries}.
       *
       * `foundInWalletRegistry: false` with `'wallet'` listed here does NOT mean the address
       * is absent from the wallet registry — it means the wallet registry never answered.
       */
      unverified: UnverifiedRegistries;
    }
  | {
      type: 'address';
      found: false;
      foundInWalletRegistry: false;
      foundInContractRegistry: false;
      data: null;
      /** Always empty. See {@link NoUnverifiedRegistries}. */
      unverified: NoUnverifiedRegistries;
    };

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
 * Result when the input is not an identifier at all.
 *
 * This is the ONLY negative answer the package hands back for something it did not query, and
 * it is safe precisely because there was nothing to query: a typo has no registry entry to
 * miss. An identifier this registry cannot answer for is a different thing entirely and does
 * not come back here — it throws. See {@link SearchType}.
 */
export interface InvalidSearchResult {
  type: 'invalid';
  found: false;
  data: null;
  /** Always empty: nothing was queried, because the input was not a valid identifier. */
  unverified: NoUnverifiedRegistries;
}

/**
 * Union of all search result types.
 */
export type SearchResult = AddressSearchResult | TransactionSearchResult | InvalidSearchResult;

// ═══════════════════════════════════════════════════════════════════════════
// STATUS INTERPRETATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simplified status for display.
 *
 * `unverified` is distinct from `not-found` on purpose: it is the state where the registry
 * did not answer, and presenting it as `not-found` is the false-negative this type exists to
 * prevent.
 */
export type ResultStatus = 'registered' | 'pending' | 'not-found' | 'unverified';

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

// ═══════════════════════════════════════════════════════════════════════════
// INDEXER STATUS (staleness)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * How far the indexer has progressed on one chain.
 */
export interface IndexerChainStatus {
  /** Chain name as configured in ponder */
  chainName: string;
  /** Numeric chain ID */
  chainId: number;
  /** Last block the indexer has processed */
  blockNumber: number;
  /** Timestamp of that block (Unix seconds) */
  blockTimestamp: number;
}

/**
 * Indexer progress across all configured chains.
 *
 * A search answers questions about the state of the world *as of* these blocks. Without it,
 * an indexer that is hours behind returns `found: false` with full confidence for everything
 * registered in the gap — indistinguishable from a genuinely clean address.
 */
export interface IndexerStatus {
  /** Per-chain progress, ordered by chain ID */
  chains: IndexerChainStatus[];
  /** Oldest chain timestamp, i.e. the worst-case freshness of any answer (Unix seconds) */
  oldestBlockTimestamp: number | null;
  /** Seconds between the oldest indexed block and now */
  lagSeconds: number | null;
}

/**
 * Core search functions for the Stolen Wallet Registry.
 *
 * These functions query the Ponder indexer via GraphQL.
 * They are framework-agnostic - wrap them in React hooks or use directly.
 */

import { request } from 'graphql-request';
import { getCAIP2ChainName } from '@swr/chains';
import { detectSearchType, parseCAIP10, parseWildcardCAIP10 } from './detect';
import {
  WALLET_QUERY,
  TRANSACTION_QUERY,
  CONTRACT_QUERY,
  OPERATOR_QUERY,
  OPERATORS_LIST_QUERY,
  REPORT_PAGE_SIZE,
  REPORT_MAX_PAGES,
  type RawPageInfo,
  type RawWalletItem,
  type RawWalletResponse,
  type RawTransactionResponse,
  type RawContractResponse,
  type RawOperatorResponse,
  type RawOperatorsListResponse,
} from './queries';
import { SearchUnavailableError } from './errors';
import type {
  Address,
  Hash,
  Hex,
  RegistryKind,
  SearchConfig,
  SearchResult,
  WalletSearchResult,
  WalletSearchData,
  TransactionSearchResult,
  ContractSearchData,
  AddressSearchResult,
  OperatorData,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map raw wallet response to WalletSearchData.
 * Shared between searchWallet and searchWalletByCAIP10.
 */
function mapWalletData(wallet: RawWalletItem): WalletSearchData {
  // Normalize null to undefined for consistent API
  const sourceChainCAIP2 = wallet.sourceChainCAIP2 ?? undefined;
  const reportedChainCAIP2 = wallet.reportedChainCAIP2 ?? undefined;

  return {
    // `id` is the full bytes32 identifier; `walletAddress` is the EVM address, and it is null
    // for non-EVM identifiers because they have no address form. This used to fall back to
    // `id` and claim the `Address` type for it, handing consumers a 66-char string that fails
    // `isAddress` on a genuine hit. The identifier now travels in its own field.
    address: (wallet.walletAddress?.toLowerCase() ?? null) as Address | null,
    identifier: wallet.id.toLowerCase() as Hex,
    caip10: wallet.caip10,
    registeredAt: BigInt(wallet.registeredAt),
    transactionHash: wallet.transactionHash as Hash,
    isSponsored: wallet.isSponsored,
    sourceChainCAIP2,
    sourceChainName: sourceChainCAIP2 ? getCAIP2ChainName(sourceChainCAIP2) : undefined,
    reportedChainCAIP2,
    reportedChainName: reportedChainCAIP2 ? getCAIP2ChainName(reportedChainCAIP2) : undefined,
  };
}

/**
 * Follow a ponder cursor to the end of a plural query, or to {@link REPORT_MAX_PAGES}.
 *
 * A search reports how many chains an identifier is flagged on, and that count is quoted to
 * users. Taking one server-chosen page and presenting it as the whole set under-reports the
 * spread with nothing to signal it, so this drains the cursor and, if it runs out of pages
 * first, says so via `truncated` instead of letting the shortfall pass as the answer.
 *
 * A page that comes back empty ends the walk even if `hasNextPage` claims otherwise: without
 * that, a server bug or a stub that echoes a stale cursor would spin here for MAX_PAGES.
 *
 * Errors are NOT swallowed. A failure on page 2 rejects, and `searchAddress` turns that into
 * an unverified registry (and, with nothing found, a throw). Returning page 1 as if it were
 * complete would be the false-clean this package exists to prevent.
 */
async function fetchAllPages<TItem>(
  config: SearchConfig,
  document: string,
  variables: Record<string, unknown>,
  select: (response: unknown) => { items?: TItem[]; pageInfo?: RawPageInfo } | undefined
): Promise<{ items: TItem[]; truncated: boolean }> {
  const items: TItem[] = [];
  let after: string | null = null;

  for (let page = 0; page < REPORT_MAX_PAGES; page++) {
    const response: unknown = await request(config.indexerUrl, document, {
      ...variables,
      limit: REPORT_PAGE_SIZE,
      after,
    });

    const connection = select(response);
    const pageItems = connection?.items ?? [];
    items.push(...pageItems);

    const pageInfo = connection?.pageInfo;
    if (pageItems.length === 0) return { items, truncated: false };
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) return { items, truncated: false };
    after = pageInfo.endCursor;
  }

  return { items, truncated: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search for a stolen wallet by address.
 *
 * @param config - Search configuration with indexer URL
 * @param address - Wallet address to search (will be lowercased)
 */
export async function searchWallet(
  config: SearchConfig,
  address: string
): Promise<WalletSearchResult> {
  const result = await request<RawWalletResponse>(config.indexerUrl, WALLET_QUERY, {
    address: address.toLowerCase(),
  });

  const wallet = result.stolenWallets?.items?.[0];

  if (!wallet) {
    return { type: 'wallet', found: false, data: null, unverified: [] };
  }

  return {
    type: 'wallet',
    found: true,
    data: mapWalletData(wallet),
    unverified: [],
  };
}

/**
 * Search for a stolen wallet by CAIP-10 identifier.
 *
 * @param config - Search configuration with indexer URL
 * @param caip10 - CAIP-10 identifier (e.g., "eip155:8453:0x...")
 *
 * @throws {SearchUnavailableError} with `reason: 'unsupported-identifier'` for any non-eip155
 *   namespace. See the comment on that branch: the indexer's stored key and the identifier a
 *   user types are different strings today, so a lookup cannot answer the question.
 */
export async function searchWalletByCAIP10(
  config: SearchConfig,
  caip10: string
): Promise<WalletSearchResult> {
  // A wallet marked stolen is stolen on EVERY EVM chain: the registry's wallet storage key
  // uses a wildcard chain reference for eip155 (CAIP10.walletKey), and the indexer stores
  // the matching wildcard form. An exact string match on "eip155:1:0x…" would therefore
  // report "not found" for a wallet that IS registered, so normalize any eip155 CAIP-10 to
  // a plain address lookup regardless of the chain the user typed.
  // The wildcard form (`eip155:*:0x…`) is what the registry stores and the UI displays, so
  // it must resolve too — parseCAIP10 cannot represent it because it returns a numeric chainId.
  const wildcard = parseWildcardCAIP10(caip10);
  if (wildcard) {
    return searchWallet(config, wildcard.address);
  }

  const evm = parseCAIP10(caip10);
  if (evm && evm.namespace === 'eip155') {
    return searchWallet(config, evm.address);
  }

  // ─── Non-EVM namespaces: cannot be answered, so this fails closed (finding S-3) ─────────
  //
  // This branch used to issue an exact-match query on `caip10.toLowerCase()`. That query can
  // never match, for two independent reasons, and a query that structurally cannot match is
  // far worse than no query at all: it returns "not found" with full confidence.
  //
  //   1. FORM. The indexer does not store the native identifier. `walletCaip10()` in
  //      apps/indexer/src/lib/identifiers.ts builds non-EVM keys as
  //      `${reportedChainCAIP2}:${normalizeIdentifier(identifier)}` — the raw 32-byte
  //      identifier as lowercase hex, because the contract event carries bytes32 and the
  //      native encoding is not recoverable from it. A user searching a Solana wallet types
  //      base58, which is a different string entirely.
  //   2. CASE. Solana base58 and Bitcoin base58check are case-SENSITIVE. `.toLowerCase()`
  //      does not normalize such an identifier, it destroys it.
  //
  // So: a registered non-EVM wallet was a permanent silent miss, and the miss rendered green.
  // Until the indexer and this package agree on one canonical non-EVM key, the honest answer
  // is "we cannot look this up", which is an unknown and takes the route every unknown takes.
  //
  // WHEN CHANGING THIS: the fix is not here alone. It requires the indexer to store a key
  // this function can construct from user input (or a resolver that maps one to the other).
  // Re-enable the lookup only once both sides derive the same string from the same wallet —
  // WALLET_BY_CAIP10_QUERY is still exported and ready for that day.
  throw new SearchUnavailableError(['wallet'], [], 'unsupported-identifier');
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search for a fraudulent transaction by hash.
 *
 * @param config - Search configuration with indexer URL
 * @param txHash - Transaction hash to search
 */
export async function searchTransaction(
  config: SearchConfig,
  txHash: string
): Promise<TransactionSearchResult> {
  const { items: transactions, truncated } = await fetchAllPages<
    RawTransactionResponse['transactionInBatchs']['items'][number]
  >(
    config,
    TRANSACTION_QUERY,
    { txHash: txHash.toLowerCase() },
    (response) => (response as RawTransactionResponse | undefined)?.transactionInBatchs
  );

  const firstTx = transactions[0];

  if (!firstTx) {
    return { type: 'transaction', found: false, data: null, unverified: [] };
  }

  return {
    type: 'transaction',
    found: true,
    unverified: [],
    data: {
      txHash: firstTx.txHash as Hash,
      chainsTruncated: truncated,
      chains: transactions.map((t) => ({
        caip2ChainId: t.caip2ChainId,
        chainName: getCAIP2ChainName(t.caip2ChainId),
        numericChainId: t.numericChainId,
        // Decimal string from a uint256 column — see the `BatchId` type.
        batchId: t.batchId ?? null,
        reporter: t.reporter as Address,
        reportedAt: BigInt(t.reportedAt),
      })),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search for a fraudulent contract by address.
 *
 * @param config - Search configuration with indexer URL
 * @param address - Contract address to search (will be lowercased)
 * @returns Contract data if found, null otherwise
 */
export async function searchContract(
  config: SearchConfig,
  address: string
): Promise<ContractSearchData | null> {
  const { items: contracts, truncated } = await fetchAllPages<
    RawContractResponse['fraudulentContracts']['items'][number]
  >(
    config,
    CONTRACT_QUERY,
    { address: address.toLowerCase() },
    (response) => (response as RawContractResponse | undefined)?.fraudulentContracts
  );

  const firstContract = contracts[0];

  if (!firstContract) {
    return null;
  }

  return {
    contractAddress: firstContract.contractAddress as Address,
    chainsTruncated: truncated,
    chains: contracts.map((c) => ({
      caip2ChainId: c.caip2ChainId,
      chainName: getCAIP2ChainName(c.caip2ChainId),
      numericChainId: c.numericChainId,
      // Decimal string from a uint256 column — see the `BatchId` type.
      batchId: c.batchId,
      operator: c.operator as Address,
      reportedAt: BigInt(c.reportedAt),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED ADDRESS SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search for an address in BOTH wallet and contract registries.
 *
 * This is the primary search function for addresses. It queries both the stolen
 * wallet registry and fraudulent contract registry in parallel, returning a
 * combined result that shows which registry(ies) the address was found in.
 *
 * A registry that fails to answer is never reported as "absent". If nothing was found and a
 * registry did not answer, this throws {@link SearchUnavailableError} rather than returning a
 * result that reads as clean. If something WAS found, it returns normally and lists the
 * unreachable registries in `unverified` — a positive hit is actionable even when the other
 * registry is down.
 *
 * @param config - Search configuration with indexer URL
 * @param address - Address to search (will be lowercased)
 *
 * @throws {SearchUnavailableError} when nothing was found and a registry did not answer
 *
 * @example
 * ```ts
 * try {
 *   const result = await searchAddress(config, '0x742d35Cc...');
 *   if (result.foundInWalletRegistry) {
 *     console.log('Address is a stolen wallet');
 *   }
 *   if (result.foundInContractRegistry) {
 *     console.log('Address is a fraudulent contract');
 *   }
 * } catch (error) {
 *   if (isSearchUnavailableError(error)) {
 *     // NOT clean — the registry could not be consulted. Fail closed.
 *   }
 * }
 * ```
 */
export async function searchAddress(
  config: SearchConfig,
  address: string
): Promise<AddressSearchResult> {
  // Query both registries in parallel for performance.
  const [walletSettled, contractSettled] = await Promise.allSettled([
    searchWallet(config, address),
    searchContract(config, address),
  ]);

  const unverified: RegistryKind[] = [];
  const failures: unknown[] = [];

  if (walletSettled.status === 'rejected') {
    unverified.push('wallet');
    failures.push(walletSettled.reason);
  }
  if (contractSettled.status === 'rejected') {
    unverified.push('contract');
    failures.push(contractSettled.reason);
  }

  const foundInWallet = walletSettled.status === 'fulfilled' && walletSettled.value.found;
  const foundInContract = contractSettled.status === 'fulfilled' && contractSettled.value !== null;
  const found = foundInWallet || foundInContract;

  // The critical branch. "Nothing found" is only meaningful if every registry answered;
  // otherwise this is an unknown, and an unknown returned as `found: false` is the
  // false-negative that clears a stolen wallet.
  if (!found && unverified.length > 0) {
    throw new SearchUnavailableError(unverified, failures);
  }

  if (!found) {
    return {
      type: 'address',
      found: false,
      foundInWalletRegistry: false,
      foundInContractRegistry: false,
      data: null,
      unverified: [],
    };
  }

  return {
    type: 'address',
    found: true,
    foundInWalletRegistry: foundInWallet,
    foundInContractRegistry: foundInContract,
    data: {
      address: address.toLowerCase() as Address,
      wallet: walletSettled.status === 'fulfilled' ? walletSettled.value.data : null,
      contract: contractSettled.status === 'fulfilled' ? contractSettled.value : null,
    },
    unverified,
  };
}

/**
 * Search a CAIP-10 identifier across BOTH the wallet and contract registries.
 *
 * `eip155:8453:0x…` is the canonical form the docs and landing page promote, so it must reach
 * every registry the bare address does. Previously the CAIP-10 path queried only the wallet
 * registry and hardcoded `foundInContractRegistry: false`, so a registered fraudulent
 * contract read as clean when searched in the very format users are told to use.
 *
 * @param config - Search configuration with indexer URL
 * @param caip10 - CAIP-10 identifier (e.g., "eip155:8453:0x…" or "eip155:*:0x…")
 *
 * @throws {SearchUnavailableError} when nothing was found and a registry could not be
 *   consulted — either because it did not answer (`reason: 'unreachable'`), or because this
 *   is a non-EVM namespace neither registry can be queried for
 *   (`reason: 'unsupported-identifier'`, always thrown for such identifiers).
 */
export async function searchAddressByCAIP10(
  config: SearchConfig,
  caip10: string
): Promise<AddressSearchResult> {
  // For EVM namespaces the address is the key in both registries, so the plain address path
  // covers wallet AND contract. (Wallet keys are chain-wildcarded; see searchWalletByCAIP10.)
  const wildcard = parseWildcardCAIP10(caip10);
  if (wildcard) {
    return searchAddress(config, wildcard.address);
  }

  const evm = parseCAIP10(caip10);
  if (evm && evm.namespace === 'eip155') {
    return searchAddress(config, evm.address);
  }

  // Non-EVM namespaces: NEITHER registry can be consulted.
  //
  // The contract registry is keyed by an EVM address and has no form for these identifiers.
  // The wallet registry has a form but not a matching one — see the long comment in
  // searchWalletByCAIP10 (finding S-3). So both are unknowns, and an unknown with nothing
  // found takes the route every unknown takes.
  //
  // This branch used to return `{ found: false, unverified: ['contract'] }`, which is exactly
  // the shape the package forbids: the flag is advisory, `found: false` is not, and
  // `if (!result.found) allow()` clears the address. It is now not even constructible — see
  // `NoUnverifiedRegistries`. The cause differs from an indexer outage (nothing failed —
  // there was nothing to query), so the error carries a distinct `reason` rather than
  // claiming the indexer went missing.
  throw new SearchUnavailableError(['wallet', 'contract'], [], 'unsupported-identifier');
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATOR LOOKUPS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get operator details by address.
 *
 * @param config - Search configuration with indexer URL
 * @param address - Operator address (will be lowercased)
 */
export async function getOperator(
  config: SearchConfig,
  address: string
): Promise<OperatorData | null> {
  const result = await request<RawOperatorResponse>(config.indexerUrl, OPERATOR_QUERY, {
    address: address.toLowerCase(),
  });

  const op = result.operator;

  if (!op) {
    return null;
  }

  return {
    address: op.id as Address,
    identifier: op.identifier,
    capabilities: op.capabilities,
    approved: op.approved,
    canSubmitWallet: op.canSubmitWallet,
    canSubmitTransaction: op.canSubmitTransaction,
    canSubmitContract: op.canSubmitContract,
    approvedAt: BigInt(op.approvedAt),
  };
}

/**
 * List all operators (optionally filtered by approval status).
 *
 * @param config - Search configuration with indexer URL
 * @param approvedOnly - If true, only return approved operators
 */
export async function listOperators(
  config: SearchConfig,
  approvedOnly: boolean = true
): Promise<OperatorData[]> {
  const result = await request<RawOperatorsListResponse>(config.indexerUrl, OPERATORS_LIST_QUERY, {
    approved: approvedOnly ? true : undefined,
  });

  const operators = result.operators?.items ?? [];

  return operators.map((op) => ({
    address: op.id as Address,
    identifier: op.identifier,
    capabilities: op.capabilities,
    approved: op.approved,
    canSubmitWallet: op.canSubmitWallet,
    canSubmitTransaction: op.canSubmitTransaction,
    canSubmitContract: op.canSubmitContract,
    approvedAt: BigInt(op.approvedAt),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search the registry with auto-detection of input type.
 *
 * Automatically detects if input is an address, transaction hash, or CAIP-10
 * identifier and routes to the appropriate search function.
 *
 * For addresses (42-char hex strings), this searches BOTH the stolen wallet
 * registry AND the fraudulent contract registry simultaneously. Results indicate
 * which registry(ies) the address was found in.
 *
 * @param config - Search configuration with indexer URL
 * @param query - Search query (address, tx hash, or CAIP-10)
 *
 * @throws {SearchUnavailableError} when the registry cannot answer for this identifier —
 *   either a registry did not respond, or the identifier belongs to a namespace this registry
 *   has no way to look up. Both are unknowns. This function NEVER returns a negative result
 *   for an identifier it did not actually check; that is what the throw is for.
 *
 * @example
 * ```ts
 * const config = { indexerUrl: 'http://localhost:42069' };
 *
 * // Search by address (checks both wallet AND contract registries)
 * const result = await search(config, '0x742d35Cc...');
 * if (result.type === 'address' && result.found) {
 *   if (result.foundInWalletRegistry) {
 *     console.log('Found in stolen wallet registry');
 *   }
 *   if (result.foundInContractRegistry) {
 *     console.log('Found in fraudulent contract registry');
 *   }
 * }
 *
 * // Search by transaction hash
 * const txResult = await search(config, '0x1234...64chars...');
 * if (txResult.type === 'transaction' && txResult.found) {
 *   console.log('Transaction reported on:', txResult.data.chains.length, 'chains');
 * }
 * ```
 */
export async function search(config: SearchConfig, query: string): Promise<SearchResult> {
  const trimmed = query.trim();
  const searchType = detectSearchType(trimmed);

  switch (searchType) {
    case 'address':
      // Searches BOTH wallet and contract registries in parallel
      return searchAddress(config, trimmed);
    case 'caip10':
      // Searches BOTH registries, same as the bare-address path.
      return searchAddressByCAIP10(config, trimmed);
    case 'transaction':
      return searchTransaction(config, trimmed);
    case 'unsupported':
      // A well-formed identifier in a namespace this registry cannot answer for (finding
      // S-2). Before this branch existed, `detectSearchType` folded it into 'invalid' and
      // `search()` handed back `{ found: false }` — which `isCompromised()` reports as false
      // and `getResultStatus()` reports as 'not-found'. An integrator writing the obvious
      // `if (!isCompromised(r)) allow()` then cleared a withdrawal for an address nothing
      // had looked at. Neither registry has a key for this, so both are named.
      throw new SearchUnavailableError(['wallet', 'contract'], [], 'unsupported-identifier');
    case 'invalid':
      // Safe, and the ONLY safe negative-without-a-query: this is not an identifier, so there
      // is no registry entry it could be missing. See `SearchType`.
      return { type: 'invalid', found: false, data: null, unverified: [] };
  }
}

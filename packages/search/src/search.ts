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
  WALLET_BY_CAIP10_QUERY,
  TRANSACTION_QUERY,
  CONTRACT_QUERY,
  OPERATOR_QUERY,
  OPERATORS_LIST_QUERY,
  type RawWalletItem,
  type RawWalletResponse,
  type RawWalletByCAIP10Response,
  type RawTransactionResponse,
  type RawContractResponse,
  type RawOperatorResponse,
  type RawOperatorsListResponse,
} from './queries';
import { SearchUnavailableError } from './errors';
import type {
  Address,
  Hash,
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
    // `id` is the full bytes32 identifier; `walletAddress` is the EVM address (null for
    // non-EVM identifiers, which have no address form).
    address: (wallet.walletAddress ?? wallet.id) as Address,
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

  // Non-EVM namespaces keep chain-specific keys, so exact match is correct there.
  const result = await request<RawWalletByCAIP10Response>(
    config.indexerUrl,
    WALLET_BY_CAIP10_QUERY,
    {
      caip10: caip10.toLowerCase(),
    }
  );

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
  const result = await request<RawTransactionResponse>(config.indexerUrl, TRANSACTION_QUERY, {
    txHash: txHash.toLowerCase(),
  });

  const transactions = result.transactionInBatchs?.items ?? [];
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
      chains: transactions.map((t) => ({
        caip2ChainId: t.caip2ChainId,
        chainName: getCAIP2ChainName(t.caip2ChainId),
        numericChainId: t.numericChainId,
        batchId: (t.batchId as Hash) ?? null,
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
  const result = await request<RawContractResponse>(config.indexerUrl, CONTRACT_QUERY, {
    address: address.toLowerCase(),
  });

  const contracts = result.fraudulentContracts?.items ?? [];
  const firstContract = contracts[0];

  if (!firstContract) {
    return null;
  }

  return {
    contractAddress: firstContract.contractAddress as Address,
    chains: contracts.map((c) => ({
      caip2ChainId: c.caip2ChainId,
      chainName: getCAIP2ChainName(c.caip2ChainId),
      numericChainId: c.numericChainId,
      batchId: c.batchId as Hash,
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
 *   consulted — either because it did not answer, or (for non-EVM namespaces) because the
 *   contract registry has no form for the identifier. Check `error.reason` to tell them apart.
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

  // Non-EVM namespaces: the contract registry is keyed by an EVM address and has no form for
  // these identifiers, so it genuinely cannot be consulted.
  //
  // That is an UNKNOWN, not an absence, and it takes the same route every other unknown takes.
  // This branch used to return `{ found: false, unverified: ['contract'] }`, which is precisely
  // the shape the package forbids elsewhere: the flag is advisory, `found: false` is not, and
  // `if (!result.found) allow()` clears the address. The cause differs from an indexer outage
  // (nothing failed — there was nothing to query), so the error carries a distinct `reason`
  // rather than claiming the indexer went missing.
  const walletResult = await searchWalletByCAIP10(config, caip10);

  if (!walletResult.found) {
    throw new SearchUnavailableError(['contract'], [], 'unsupported-identifier');
  }

  // A hit is actionable even with partial coverage, so it returns — with the gap stated,
  // exactly as the EVM partial-failure path does.
  return {
    type: 'address',
    found: true,
    foundInWalletRegistry: true,
    foundInContractRegistry: false,
    data: walletResult.data
      ? {
          address: walletResult.data.address,
          wallet: walletResult.data,
          contract: null,
        }
      : null,
    unverified: ['contract'],
  };
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
    case 'invalid':
      return { type: 'invalid', found: false, data: null, unverified: [] };
  }
}

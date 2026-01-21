/**
 * Core search functions for the Stolen Wallet Registry.
 *
 * These functions query the Ponder indexer via GraphQL.
 * They are framework-agnostic - wrap them in React hooks or use directly.
 */

import { request } from 'graphql-request';
import { getCAIP2ChainName } from '@swr/chains';
import { detectSearchType } from './detect';
import {
  WALLET_QUERY,
  WALLET_BY_CAIP10_QUERY,
  TRANSACTION_QUERY,
  type RawWalletResponse,
  type RawWalletByCAIP10Response,
  type RawTransactionResponse,
} from './queries';
import type {
  Address,
  Hash,
  SearchConfig,
  SearchResult,
  WalletSearchResult,
  WalletSearchData,
  TransactionSearchResult,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map raw wallet response to WalletSearchData.
 * Shared between searchWallet and searchWalletByCAIP10.
 */
function mapWalletData(wallet: {
  id: string;
  caip10: string;
  registeredAt: string;
  transactionHash: string;
  isSponsored: boolean;
  sourceChainCAIP2?: string | null;
}): WalletSearchData {
  // Normalize null to undefined for consistent API
  const sourceChainCAIP2 = wallet.sourceChainCAIP2 ?? undefined;

  return {
    address: wallet.id as Address,
    caip10: wallet.caip10,
    registeredAt: BigInt(wallet.registeredAt),
    transactionHash: wallet.transactionHash as Hash,
    isSponsored: wallet.isSponsored,
    sourceChainCAIP2,
    sourceChainName: sourceChainCAIP2 ? getCAIP2ChainName(sourceChainCAIP2) : undefined,
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

  const wallet = result.stolenWallet;

  if (!wallet) {
    return { type: 'wallet', found: false, data: null };
  }

  return {
    type: 'wallet',
    found: true,
    data: mapWalletData(wallet),
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
  const result = await request<RawWalletByCAIP10Response>(
    config.indexerUrl,
    WALLET_BY_CAIP10_QUERY,
    {
      caip10: caip10.toLowerCase(),
    }
  );

  const wallet = result.stolenWallets?.items?.[0];

  if (!wallet) {
    return { type: 'wallet', found: false, data: null };
  }

  return {
    type: 'wallet',
    found: true,
    data: mapWalletData(wallet),
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

  if (transactions.length === 0) {
    return { type: 'transaction', found: false, data: null };
  }

  return {
    type: 'transaction',
    found: true,
    data: {
      txHash: transactions[0].txHash as Hash,
      chains: transactions.map((t) => ({
        caip2ChainId: t.caip2ChainId,
        chainName: getCAIP2ChainName(t.caip2ChainId),
        numericChainId: t.numericChainId,
        batchId: t.batchId as Hash,
        reporter: t.reporter as Address,
        reportedAt: BigInt(t.reportedAt),
      })),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search the registry with auto-detection of input type.
 *
 * Automatically detects if input is a wallet address, transaction hash,
 * or CAIP-10 identifier and routes to the appropriate search function.
 *
 * @param config - Search configuration with indexer URL
 * @param query - Search query (address, tx hash, or CAIP-10)
 *
 * @example
 * ```ts
 * const config = { indexerUrl: 'http://localhost:42069' };
 *
 * // Search by wallet address
 * const result = await search(config, '0x742d35Cc...');
 * if (result.type === 'wallet' && result.found) {
 *   console.log('Wallet is stolen:', result.data.address);
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

  if (searchType === 'invalid' || !trimmed) {
    return { type: 'invalid', found: false, data: null };
  }

  if (searchType === 'wallet') {
    return searchWallet(config, trimmed);
  }

  if (searchType === 'caip10') {
    return searchWalletByCAIP10(config, trimmed);
  }

  if (searchType === 'transaction') {
    return searchTransaction(config, trimmed);
  }

  return { type: 'invalid', found: false, data: null };
}

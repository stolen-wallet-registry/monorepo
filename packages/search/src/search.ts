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
  CONTRACT_QUERY,
  OPERATOR_QUERY,
  OPERATORS_LIST_QUERY,
  type RawWalletResponse,
  type RawWalletByCAIP10Response,
  type RawTransactionResponse,
  type RawContractResponse,
  type RawOperatorResponse,
  type RawOperatorsListResponse,
} from './queries';
import type {
  Address,
  Hash,
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

  const transactions = result.transactionInBatches?.items ?? [];
  const firstTx = transactions[0];

  if (!firstTx) {
    return { type: 'transaction', found: false, data: null };
  }

  return {
    type: 'transaction',
    found: true,
    data: {
      txHash: firstTx.txHash as Hash,
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
 * @param config - Search configuration with indexer URL
 * @param address - Address to search (will be lowercased)
 *
 * @example
 * ```ts
 * const result = await searchAddress(config, '0x742d35Cc...');
 * if (result.foundInWalletRegistry) {
 *   console.log('Address is a stolen wallet');
 * }
 * if (result.foundInContractRegistry) {
 *   console.log('Address is a fraudulent contract');
 * }
 * ```
 */
export async function searchAddress(
  config: SearchConfig,
  address: string
): Promise<AddressSearchResult> {
  // Query both registries in parallel for performance
  // Use Promise.allSettled to handle partial failures gracefully
  const [walletSettled, contractSettled] = await Promise.allSettled([
    searchWallet(config, address),
    searchContract(config, address),
  ]);

  // Extract results, defaulting to "not found" on failure
  const walletResult =
    walletSettled.status === 'fulfilled'
      ? walletSettled.value
      : { found: false as const, data: null };

  const contractData = contractSettled.status === 'fulfilled' ? contractSettled.value : null;

  // Log any failures for debugging
  if (walletSettled.status === 'rejected') {
    console.warn('Wallet search failed:', walletSettled.reason);
  }
  if (contractSettled.status === 'rejected') {
    console.warn('Contract search failed:', contractSettled.reason);
  }

  const foundInWallet = walletResult.found;
  const foundInContract = contractData !== null;
  const found = foundInWallet || foundInContract;

  if (!found) {
    return {
      type: 'address',
      found: false,
      foundInWalletRegistry: false,
      foundInContractRegistry: false,
      data: null,
    };
  }

  return {
    type: 'address',
    found: true,
    foundInWalletRegistry: foundInWallet,
    foundInContractRegistry: foundInContract,
    data: {
      address: address.toLowerCase() as Address,
      wallet: walletResult.data,
      contract: contractData,
    },
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
    case 'caip10': {
      // CAIP-10 currently only searches wallet registry
      // TODO: Add contract registry support for CAIP-10 if needed
      const walletResult = await searchWalletByCAIP10(config, trimmed);
      // Convert WalletSearchResult to AddressSearchResult for consistency
      return {
        type: 'address',
        found: walletResult.found,
        foundInWalletRegistry: walletResult.found,
        foundInContractRegistry: false,
        data: walletResult.data
          ? {
              address: walletResult.data.address,
              wallet: walletResult.data,
              contract: null,
            }
          : null,
      };
    }
    case 'transaction':
      return searchTransaction(config, trimmed);
    case 'invalid':
      return { type: 'invalid', found: false, data: null };
  }
}

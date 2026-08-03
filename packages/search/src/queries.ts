/**
 * GraphQL queries for the Ponder indexer.
 *
 * NOTE: Ponder auto-pluralizes table names by appending "s". For tables already
 * ending in "s" (e.g. `transactionInBatch`, `walletBatch`) this produces
 * `transactionInBatchs` and `walletBatchs` — grammatically odd but correct
 * per Ponder's convention. Do NOT "fix" these to `transactionInBatches` etc.
 */

import { gql } from 'graphql-request';

/**
 * Query a stolen wallet by address (lowercase).
 */
export const WALLET_QUERY = gql`
  query SearchWallet($address: String!) {
    stolenWallets(where: { walletAddress: $address }, limit: 1) {
      items {
        id
        walletAddress
        caip10
        registeredAt
        transactionHash
        isSponsored
        sourceChainCAIP2
        reportedChainCAIP2
      }
    }
  }
`;

/**
 * Query a stolen wallet by CAIP-10 identifier.
 */
export const WALLET_BY_CAIP10_QUERY = gql`
  query SearchWalletByCAIP10($caip10: String!) {
    stolenWallets(where: { caip10: $caip10 }, limit: 1) {
      items {
        id
        walletAddress
        caip10
        registeredAt
        transactionHash
        isSponsored
        sourceChainCAIP2
        reportedChainCAIP2
      }
    }
  }
`;

/**
 * Page size for the two per-chain report lookups below, and the number of pages either will
 * follow before giving up and reporting the result as truncated.
 *
 * Both queries used to take whatever the server handed back — TRANSACTION_QUERY passed no
 * limit at all and silently inherited ponder's `DEFAULT_LIMIT = 50`, CONTRACT_QUERY pinned
 * `limit: 10` — with no cursor follow-up in either case. A contract flagged on 12 chains
 * reported 10, and `chains.length` is quoted verbatim in user-facing copy.
 *
 * 100 per page sits well under ponder's `MAX_LIMIT = 1000` and covers every realistic
 * multi-chain report in one round trip; the page cap exists only so a pathological row count
 * cannot turn one search into an unbounded fetch loop. Exceeding it sets `chainsTruncated`
 * rather than passing the shortfall off as the whole answer.
 */
export const REPORT_PAGE_SIZE = 100;
export const REPORT_MAX_PAGES = 20;

/**
 * Query fraudulent transactions by transaction hash.
 *
 * Paginated — see {@link REPORT_PAGE_SIZE}. `orderBy` is pinned because a cursor is only
 * stable under a deterministic order.
 */
export const TRANSACTION_QUERY = gql`
  query SearchTransaction($txHash: String!, $limit: Int!, $after: String) {
    transactionInBatchs(
      where: { txHash: $txHash }
      orderBy: "reportedAt"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items {
        id
        txHash
        caip2ChainId
        numericChainId
        batchId
        reporter
        reportedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Query fraudulent contracts by address.
 *
 * Paginated — see {@link REPORT_PAGE_SIZE}.
 */
export const CONTRACT_QUERY = gql`
  query SearchContract($address: String!, $limit: Int!, $after: String) {
    fraudulentContracts(
      where: { contractAddress: $address }
      orderBy: "reportedAt"
      orderDirection: "asc"
      limit: $limit
      after: $after
    ) {
      items {
        contractAddress
        caip2ChainId
        numericChainId
        batchId
        operator
        reportedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Query a single operator by address.
 */
export const OPERATOR_QUERY = gql`
  query GetOperator($address: String!) {
    operator(id: $address) {
      id
      identifier
      capabilities
      approved
      canSubmitWallet
      canSubmitTransaction
      canSubmitContract
      approvedAt
    }
  }
`;

/**
 * Query list of operators.
 */
export const OPERATORS_LIST_QUERY = gql`
  query ListOperators($approved: Boolean) {
    operators(where: { approved: $approved }, orderBy: "approvedAt", orderDirection: "desc") {
      items {
        id
        identifier
        capabilities
        approved
        canSubmitWallet
        canSubmitTransaction
        canSubmitContract
        approvedAt
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query global registry statistics.
 */
export const REGISTRY_STATS_QUERY = gql`
  query GetRegistryStats {
    registryStats(id: "global") {
      id
      totalWalletRegistrations
      totalTransactionBatches
      totalTransactionsReported
      sponsoredRegistrations
      directRegistrations
      crossChainRegistrations
      walletSoulboundsMinted
      supportSoulboundsMinted
      totalSupportDonations
      totalOperators
      activeOperators
      totalWalletBatches
      totalOperatorTransactionBatches
      totalContractBatches
      totalFraudulentContracts
      lastUpdated
    }
  }
`;

/**
 * Query recent stolen wallet registrations.
 */
export const RECENT_WALLETS_QUERY = gql`
  query RecentWallets($limit: Int!, $offset: Int) {
    stolenWallets(orderBy: "registeredAt", orderDirection: "desc", limit: $limit, offset: $offset) {
      items {
        id
        walletAddress
        caip10
        registeredAt
        transactionHash
        isSponsored
        operator
        sourceChainCAIP2
        reportedChainCAIP2
        batchId
      }
    }
  }
`;

/**
 * Query recent fraudulent contract registrations.
 */
export const RECENT_CONTRACTS_QUERY = gql`
  query RecentContracts($limit: Int!, $offset: Int) {
    fraudulentContracts(
      orderBy: "reportedAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        contractAddress
        caip2ChainId
        batchId
        operator
        reportedAt
      }
    }
  }
`;

/**
 * Query recent transaction batch registrations.
 * Note: Use RECENT_TRANSACTION_ENTRIES_QUERY for individual transactions.
 */
export const RECENT_TRANSACTIONS_QUERY = gql`
  query RecentTransactions($limit: Int!, $offset: Int) {
    transactionBatchs(
      orderBy: "registeredAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        dataHash
        reporter
        reportedChainCAIP2
        transactionCount
        isSponsored
        isOperator
        operatorId
        registeredAt
        transactionHash
      }
    }
  }
`;

/**
 * Query recent individual transaction entries (from transactionInBatch).
 * Use this for dashboard views that need to show individual stolen transactions.
 */
export const RECENT_TRANSACTION_ENTRIES_QUERY = gql`
  query RecentTransactionEntries($limit: Int!, $offset: Int) {
    transactionInBatchs(
      orderBy: "reportedAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        txHash
        caip2ChainId
        numericChainId
        batchId
        reporter
        reportedAt
        transactionHash
      }
    }
  }
`;

/**
 * Query recent wallet batch registrations (operator submissions).
 */
export const RECENT_WALLET_BATCHES_QUERY = gql`
  query RecentWalletBatches($limit: Int!, $offset: Int) {
    walletBatchs(orderBy: "registeredAt", orderDirection: "desc", limit: $limit, offset: $offset) {
      items {
        id
        operatorId
        operator
        reportedChainCAIP2
        walletCount
        registeredAt
        transactionHash
      }
    }
  }
`;

/**
 * Query recent fraudulent contract batch registrations.
 */
export const RECENT_CONTRACT_BATCHES_QUERY = gql`
  query RecentContractBatches($limit: Int!, $offset: Int) {
    fraudulentContractBatchs(
      orderBy: "registeredAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        operatorId
        operator
        reportedChainCAIP2
        contractCount
        registeredAt
        transactionHash
      }
    }
  }
`;

/**
 * Query wallet batch only (no entries). Used as step 1 of two-step fetch.
 */
export const WALLET_BATCH_ONLY_QUERY = gql`
  query WalletBatchOnly($batchId: String!) {
    walletBatch(id: $batchId) {
      id
      operatorId
      operator
      reportedChainCAIP2
      walletCount
      registeredAt
      transactionHash
    }
  }
`;

/**
 * Query wallet entries by transactionHash (join key). Used as step 2 of two-step fetch.
 */
export const WALLET_ENTRIES_BY_TX_HASH_QUERY = gql`
  query WalletEntriesByTxHash($txHash: String!, $limit: Int!, $offset: Int) {
    stolenWallets(
      where: { transactionHash: $txHash }
      orderBy: "registeredAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        walletAddress
        caip10
        registeredAt
        transactionHash
        operator
        sourceChainCAIP2
        reportedChainCAIP2
      }
    }
  }
`;

/**
 * Query transaction batch only (no entries). Used as step 1 of two-step fetch.
 */
export const TRANSACTION_BATCH_ONLY_QUERY = gql`
  query TransactionBatchOnly($batchId: String!) {
    transactionBatch(id: $batchId) {
      id
      dataHash
      reporter
      reportedChainCAIP2
      transactionCount
      isSponsored
      isOperator
      operatorId
      registeredAt
      transactionHash
    }
  }
`;

/**
 * Query transaction entries by transactionHash (join key). Used as step 2 of two-step fetch.
 */
export const TRANSACTION_ENTRIES_BY_TX_HASH_QUERY = gql`
  query TransactionEntriesByTxHash($txHash: String!, $limit: Int!, $offset: Int) {
    transactionInBatchs(
      where: { transactionHash: $txHash }
      orderBy: "reportedAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        txHash
        caip2ChainId
        numericChainId
        reporter
        reportedAt
      }
    }
  }
`;

/**
 * Query contract batch detail + entries.
 */
export const CONTRACT_BATCH_DETAIL_QUERY = gql`
  query ContractBatchDetail($batchId: String!, $limit: Int!, $offset: Int) {
    fraudulentContractBatch(id: $batchId) {
      id
      operatorId
      operator
      reportedChainCAIP2
      contractCount
      registeredAt
      transactionHash
    }
    fraudulentContracts(
      where: { batchId: $batchId }
      orderBy: "reportedAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        contractAddress
        caip2ChainId
        numericChainId
        operator
        reportedAt
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// RAW RESPONSE TYPES (from Ponder indexer)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A stolen wallet row.
 *
 * `id` is the FULL bytes32 identifier from the contract event, NOT an address — non-EVM
 * namespaces use all 32 bytes. Use `walletAddress` (null for non-EVM) for the address.
 *
 * `caip10` uses the wildcard chain reference for EVM wallets ("eip155:*:0x…") because the
 * registry's wallet key is chain-wildcarded. Use `reportedChainCAIP2` for the chain the
 * incident was reported on.
 */
export interface RawWalletItem {
  id: string;
  walletAddress: string | null;
  caip10: string;
  registeredAt: string;
  transactionHash: string;
  isSponsored: boolean;
  sourceChainCAIP2?: string | null;
  reportedChainCAIP2?: string | null;
}

/** Also the response shape for `WALLET_BY_CAIP10_QUERY`, whenever that lookup is re-enabled. */
export interface RawWalletResponse {
  stolenWallets: {
    items: RawWalletItem[];
  };
}

/**
 * Ponder's cursor envelope on a plural query.
 *
 * Optional because tests and older stubs return bare `{ items }`; an absent `pageInfo` is
 * read as "no further pages", which stops the loop rather than looping forever on undefined.
 */
export interface RawPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface RawTransactionResponse {
  transactionInBatchs: {
    items: Array<{
      id: string;
      txHash: string;
      caip2ChainId: string;
      numericChainId?: number;
      /** uint256 batch ID as a DECIMAL string, not hex. */
      batchId: string | null;
      reporter: string;
      reportedAt: string;
    }>;
    pageInfo?: RawPageInfo;
  };
}

export interface RawContractResponse {
  fraudulentContracts: {
    items: Array<{
      contractAddress: string;
      caip2ChainId: string;
      numericChainId?: number;
      /** uint256 batch ID as a DECIMAL string, not hex. */
      batchId: string;
      operator: string;
      reportedAt: string;
    }>;
    pageInfo?: RawPageInfo;
  };
}

export interface RawOperatorResponse {
  operator: {
    id: string;
    identifier: string;
    capabilities: number;
    approved: boolean;
    canSubmitWallet: boolean;
    canSubmitTransaction: boolean;
    canSubmitContract: boolean;
    approvedAt: string;
  } | null;
}

export interface RawOperatorsListResponse {
  operators: {
    items: Array<{
      id: string;
      identifier: string;
      capabilities: number;
      approved: boolean;
      canSubmitWallet: boolean;
      canSubmitTransaction: boolean;
      canSubmitContract: boolean;
      approvedAt: string;
    }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD RAW RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RawRegistryStatsResponse {
  registryStats: {
    id: string;
    totalWalletRegistrations: number;
    totalTransactionBatches: number;
    totalTransactionsReported: number;
    sponsoredRegistrations: number;
    directRegistrations: number;
    crossChainRegistrations: number;
    walletSoulboundsMinted: number;
    supportSoulboundsMinted: number;
    totalSupportDonations: string;
    totalOperators: number;
    activeOperators: number;
    totalWalletBatches: number;
    totalOperatorTransactionBatches: number;
    totalContractBatches: number;
    totalFraudulentContracts: number;
    lastUpdated: string;
  } | null;
}

export interface RawRecentWalletsResponse {
  stolenWallets: {
    /** RECENT_WALLETS_QUERY selects every RawWalletItem field plus the batch columns. */
    items: Array<RawWalletItem & { operator?: string; batchId?: string }>;
  };
}

export interface RawRecentContractsResponse {
  fraudulentContracts: {
    items: Array<{
      id: string;
      contractAddress: string;
      caip2ChainId: string;
      batchId: string;
      operator: string;
      reportedAt: string;
    }>;
  };
}

export interface RawRecentTransactionsResponse {
  transactionBatchs: {
    items: Array<{
      id: string;
      dataHash: string;
      reporter: string;
      reportedChainCAIP2?: string;
      transactionCount: number;
      isSponsored: boolean;
      isOperator: boolean;
      operatorId?: string;
      registeredAt: string;
      transactionHash: string;
    }>;
  };
}

export interface RawRecentTransactionEntriesResponse {
  transactionInBatchs: {
    items: Array<{
      id: string;
      txHash: string;
      caip2ChainId: string;
      numericChainId?: number;
      batchId?: string;
      reporter: string;
      reportedAt: string;
      transactionHash: string;
    }>;
  };
}

export interface RawRecentWalletBatchesResponse {
  walletBatchs: {
    items: Array<{
      id: string;
      operatorId: string;
      operator: string;
      reportedChainCAIP2?: string;
      walletCount: number;
      registeredAt: string;
      transactionHash: string;
    }>;
  };
}

export interface RawRecentContractBatchesResponse {
  fraudulentContractBatchs: {
    items: Array<{
      id: string;
      operatorId: string;
      operator: string;
      reportedChainCAIP2?: string;
      contractCount: number;
      registeredAt: string;
      transactionHash: string;
    }>;
  };
}

export interface RawWalletBatchOnlyResponse {
  walletBatch: {
    id: string;
    operatorId: string;
    operator: string;
    reportedChainCAIP2?: string;
    walletCount: number;
    registeredAt: string;
    transactionHash: string;
  } | null;
}

export interface RawWalletEntriesByTxHashResponse {
  stolenWallets: {
    /**
     * `isSponsored` is omitted deliberately — WALLET_ENTRIES_BY_TX_HASH_QUERY does not
     * select it, so typing it as present would misrepresent the response.
     */
    items: Array<Omit<RawWalletItem, 'isSponsored'> & { operator?: string }>;
  };
}

export interface RawTransactionBatchOnlyResponse {
  transactionBatch: {
    id: string;
    dataHash: string;
    reporter: string;
    reportedChainCAIP2?: string;
    transactionCount: number;
    isSponsored: boolean;
    isOperator: boolean;
    operatorId?: string;
    registeredAt: string;
    transactionHash: string;
  } | null;
}

export interface RawTransactionEntriesByTxHashResponse {
  transactionInBatchs: {
    items: Array<{
      id: string;
      txHash: string;
      caip2ChainId: string;
      numericChainId?: number;
      reporter: string;
      reportedAt: string;
    }>;
  };
}

export interface RawContractBatchDetailResponse {
  fraudulentContractBatch: {
    id: string;
    operatorId: string;
    operator: string;
    reportedChainCAIP2?: string;
    contractCount: number;
    registeredAt: string;
    transactionHash: string;
  } | null;
  fraudulentContracts: {
    items: Array<{
      contractAddress: string;
      caip2ChainId: string;
      numericChainId?: number;
      operator: string;
      reportedAt: string;
    }>;
  };
}

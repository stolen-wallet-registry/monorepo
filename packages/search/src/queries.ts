/**
 * GraphQL queries for the Ponder indexer.
 */

import { gql } from 'graphql-request';

/**
 * Query a stolen wallet by address (lowercase).
 */
export const WALLET_QUERY = gql`
  query SearchWallet($address: String!) {
    stolenWallet(id: $address) {
      id
      caip10
      registeredAt
      transactionHash
      isSponsored
      sourceChainCAIP2
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
        caip10
        registeredAt
        transactionHash
        isSponsored
        sourceChainCAIP2
      }
    }
  }
`;

/**
 * Query fraudulent transactions by transaction hash.
 */
export const TRANSACTION_QUERY = gql`
  query SearchTransaction($txHash: String!) {
    transactionInBatchs(where: { txHash: $txHash }) {
      items {
        id
        txHash
        caip2ChainId
        numericChainId
        batchId
        reporter
        reportedAt
      }
    }
  }
`;

/**
 * Query fraudulent contracts by address.
 * Note: entryHash is used to check invalidation status via separate query.
 */
export const CONTRACT_QUERY = gql`
  query SearchContract($address: String!) {
    fraudulentContracts(where: { contractAddress: $address }, limit: 10) {
      items {
        contractAddress
        caip2ChainId
        numericChainId
        batchId
        operator
        reportedAt
        entryHash
      }
    }
  }
`;

/**
 * Query invalidation status for a single entry hash.
 */
export const INVALIDATION_CHECK_QUERY = gql`
  query CheckInvalidation($entryHash: String!) {
    invalidatedEntry(id: $entryHash) {
      id
      invalidatedAt
      invalidatedBy
      reinstated
      reinstatedAt
    }
  }
`;

/**
 * Query invalidation status for multiple entry hashes.
 * Used for batch checking after CONTRACT_QUERY.
 */
export const INVALIDATIONS_BATCH_QUERY = gql`
  query CheckInvalidations($entryHashes: [String!]!) {
    invalidatedEntrys(where: { id_in: $entryHashes }) {
      items {
        id
        invalidatedAt
        invalidatedBy
        reinstated
        reinstatedAt
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
      invalidatedContractBatches
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
        caip10
        registeredAt
        transactionHash
        isSponsored
        operator
        sourceChainCAIP2
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
        merkleRoot
        reporter
        reportedChainCAIP2
        transactionCount
        isSponsored
        isOperatorVerified
        verifyingOperator
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
        merkleRoot
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
        merkleRoot
        operator
        reportedChainCAIP2
        contractCount
        registeredAt
        transactionHash
        invalidated
        invalidatedAt
      }
    }
  }
`;

/**
 * Query wallet batch detail + entries.
 */
export const WALLET_BATCH_DETAIL_QUERY = gql`
  query WalletBatchDetail($batchId: String!, $limit: Int!, $offset: Int) {
    walletBatch(id: $batchId) {
      id
      merkleRoot
      operator
      reportedChainCAIP2
      walletCount
      registeredAt
      transactionHash
    }
    stolenWallets(
      where: { batchId: $batchId }
      orderBy: "registeredAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      items {
        id
        caip10
        registeredAt
        transactionHash
        operator
        sourceChainCAIP2
      }
    }
  }
`;

/**
 * Query transaction batch detail + entries.
 */
export const TRANSACTION_BATCH_DETAIL_QUERY = gql`
  query TransactionBatchDetail($batchId: String!, $limit: Int!, $offset: Int) {
    transactionBatch(id: $batchId) {
      id
      merkleRoot
      reporter
      reportedChainCAIP2
      transactionCount
      isSponsored
      isOperatorVerified
      verifyingOperator
      registeredAt
      transactionHash
    }
    transactionInBatchs(
      where: { batchId: $batchId }
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
      merkleRoot
      operator
      reportedChainCAIP2
      contractCount
      registeredAt
      transactionHash
      invalidated
      invalidatedAt
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
        entryHash
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// RAW RESPONSE TYPES (from Ponder indexer)
// ═══════════════════════════════════════════════════════════════════════════

export interface RawWalletResponse {
  stolenWallet: {
    id: string;
    caip10: string;
    registeredAt: string;
    transactionHash: string;
    isSponsored: boolean;
    sourceChainCAIP2?: string;
  } | null;
}

export interface RawWalletByCAIP10Response {
  stolenWallets: {
    items: Array<{
      id: string;
      caip10: string;
      registeredAt: string;
      transactionHash: string;
      isSponsored: boolean;
      sourceChainCAIP2?: string;
    }>;
  };
}

export interface RawTransactionResponse {
  transactionInBatchs: {
    items: Array<{
      id: string;
      txHash: string;
      caip2ChainId: string;
      numericChainId?: number;
      batchId: string;
      reporter: string;
      reportedAt: string;
    }>;
  };
}

export interface RawContractResponse {
  fraudulentContracts: {
    items: Array<{
      contractAddress: string;
      caip2ChainId: string;
      numericChainId?: number;
      batchId: string;
      operator: string;
      reportedAt: string;
      entryHash: string;
    }>;
  };
}

export interface RawInvalidationCheckResponse {
  invalidatedEntry: {
    id: string;
    invalidatedAt: string;
    invalidatedBy: string;
    reinstated: boolean;
    reinstatedAt: string | null;
  } | null;
}

export interface RawInvalidationsBatchResponse {
  invalidatedEntrys: {
    items: Array<{
      id: string;
      invalidatedAt: string;
      invalidatedBy: string;
      reinstated: boolean;
      reinstatedAt: string | null;
    }>;
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
    invalidatedContractBatches: number;
    lastUpdated: string;
  } | null;
}

export interface RawRecentWalletsResponse {
  stolenWallets: {
    items: Array<{
      id: string;
      caip10: string;
      registeredAt: string;
      transactionHash: string;
      isSponsored: boolean;
      operator?: string;
      sourceChainCAIP2?: string;
    }>;
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
      merkleRoot: string;
      reporter: string;
      reportedChainCAIP2?: string;
      transactionCount: number;
      isSponsored: boolean;
      isOperatorVerified: boolean;
      verifyingOperator?: string;
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
      batchId: string;
      reporter: string;
      reportedAt: string;
    }>;
  };
}

export interface RawRecentWalletBatchesResponse {
  walletBatchs: {
    items: Array<{
      id: string;
      merkleRoot: string;
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
      merkleRoot: string;
      operator: string;
      reportedChainCAIP2?: string;
      contractCount: number;
      registeredAt: string;
      transactionHash: string;
      invalidated: boolean;
      invalidatedAt?: string | null;
    }>;
  };
}

export interface RawWalletBatchDetailResponse {
  walletBatch: {
    id: string;
    merkleRoot: string;
    operator: string;
    reportedChainCAIP2?: string;
    walletCount: number;
    registeredAt: string;
    transactionHash: string;
  } | null;
  stolenWallets: {
    items: Array<{
      id: string;
      caip10: string;
      registeredAt: string;
      transactionHash: string;
      operator?: string;
      sourceChainCAIP2?: string;
    }>;
  };
}

export interface RawTransactionBatchDetailResponse {
  transactionBatch: {
    id: string;
    merkleRoot: string;
    reporter: string;
    reportedChainCAIP2?: string;
    transactionCount: number;
    isSponsored: boolean;
    isOperatorVerified: boolean;
    verifyingOperator?: string;
    registeredAt: string;
    transactionHash: string;
  } | null;
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
    merkleRoot: string;
    operator: string;
    reportedChainCAIP2?: string;
    contractCount: number;
    registeredAt: string;
    transactionHash: string;
    invalidated: boolean;
    invalidatedAt?: string | null;
  } | null;
  fraudulentContracts: {
    items: Array<{
      contractAddress: string;
      caip2ChainId: string;
      numericChainId?: number;
      operator: string;
      reportedAt: string;
      entryHash: string;
    }>;
  };
}

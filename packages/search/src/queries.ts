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
        entryInvalidated
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
      entryInvalidated: boolean;
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

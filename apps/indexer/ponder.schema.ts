import { index, onchainTable } from 'ponder';

// ═══════════════════════════════════════════════════════════════════════════
// WALLET REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/** Registered stolen wallets */
export const stolenWallet = onchainTable(
  'stolen_wallet',
  (t) => ({
    /** Wallet address (lowercase) */
    id: t.hex().primaryKey(),
    /** CAIP-10 format: "eip155:31337:0x..." */
    caip10: t.text().notNull(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
    /** Was gas sponsored (relay)? */
    isSponsored: t.boolean().notNull(),
    /** If from operator batch, the operator address */
    operator: t.hex(),
    /** If cross-chain, source chain ID (numeric) */
    sourceChainId: t.integer(),
    /** If cross-chain, CAIP-2 string of source chain */
    sourceChainCAIP2: t.text(),
    /** If cross-chain, Hyperlane message ID */
    messageId: t.hex(),
    /** bytes32 CAIP-2 hash where incident occurred */
    reportedChainId: t.hex(),
    /** Resolved CAIP-2 string (e.g. "eip155:1") from reportedChainId hash */
    reportedChainCAIP2: t.text(),
    /** uint64 when theft happened */
    incidentTimestamp: t.bigint(),
    /** 0=local, 1=Hyperlane */
    bridgeId: t.integer(),
    /** If from operator batch, the batch ID (uint256 as string) */
    batchId: t.text(),
  }),
  (table) => ({
    caip10Idx: index().on(table.caip10),
    registeredAtIdx: index().on(table.registeredAt),
    batchIdIdx: index().on(table.batchId),
    reportedChainIdIdx: index().on(table.reportedChainId),
    txHashIdx: index().on(table.transactionHash),
  })
);

/** Operator-submitted wallet batches (BatchCreated event) */
export const walletBatch = onchainTable(
  'wallet_batch',
  (t) => ({
    /** uint256 batchId as string */
    id: t.text().primaryKey(),
    /** Operator ID (bytes32 hash of operator name) */
    operatorId: t.hex().notNull(),
    /** Operator address (from event.transaction.from) */
    operator: t.hex().notNull(),
    /** Reported chain CAIP-2 (resolved from first wallet in batch) */
    reportedChainCAIP2: t.text(),
    /** Actual wallet count (excludes skipped zeros and already-registered) */
    walletCount: t.integer().notNull(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    operatorIdx: index().on(table.operator),
    registeredAtIdx: index().on(table.registeredAt),
  })
);

/** Pending wallet acknowledgements (in grace period) */
export const walletAcknowledgement = onchainTable(
  'wallet_acknowledgement',
  (t) => ({
    /** Registeree address (lowercase) */
    id: t.hex().primaryKey(),
    /** Trusted forwarder address */
    trustedForwarder: t.hex().notNull(),
    /** Block timestamp when acknowledged */
    acknowledgedAt: t.bigint().notNull(),
    /** Block number when acknowledged */
    acknowledgedAtBlock: t.bigint().notNull(),
    /** Acknowledgement transaction hash */
    transactionHash: t.hex().notNull(),
    /** Was gas sponsored? */
    isSponsored: t.boolean().notNull(),
    /** Calculated grace period start block */
    gracePeriodStart: t.bigint().notNull(),
    /** Calculated grace period end block */
    gracePeriodEnd: t.bigint().notNull(),
    /** Status: pending, registered, expired */
    status: t.text().notNull(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/** Transaction batch (unified batchId across individual and operator) */
export const transactionBatch = onchainTable(
  'transaction_batch',
  (t) => ({
    /** uint256 batchId as string — unified across individual and operator */
    id: t.text().primaryKey(),
    /** dataHash = hash of (txHashes, chainIds). bytes32(0) for operator batches */
    dataHash: t.hex().notNull(),
    /** Address that reported */
    reporter: t.hex().notNull(),
    /** Reported chain ID hash (from first TransactionRegistered in same tx) */
    reportedChainIdHash: t.hex(),
    /** CAIP-2 chain ID (resolved) */
    reportedChainCAIP2: t.text(),
    /** Number of txs in batch */
    transactionCount: t.integer().notNull(),
    /** Was gas sponsored? */
    isSponsored: t.boolean().notNull(),
    /** Is from operator batch (TransactionBatchCreated vs TransactionBatchRegistered) */
    isOperator: t.boolean().notNull(),
    /** Operator ID (bytes32, only for operator batches) */
    operatorId: t.hex(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
    /** If cross-chain, source chain ID */
    sourceChainId: t.integer(),
    /** If cross-chain, Hyperlane message ID */
    messageId: t.hex(),
  }),
  (table) => ({
    reporterIdx: index().on(table.reporter),
    registeredAtIdx: index().on(table.registeredAt),
    isOperatorIdx: index().on(table.isOperator),
    txHashIdx: index().on(table.transactionHash),
  })
);

/**
 * Individual transactions in a batch (for querying "is this tx reported?")
 * Entries link to parent batch via transactionHash join (no batchId on per-entry events)
 */
export const transactionInBatch = onchainTable(
  'transaction_in_batch',
  (t) => ({
    /** txHash-chainIdHash composite key */
    id: t.text().primaryKey(),
    /** Transaction hash (bytes32) */
    txHash: t.hex().notNull(),
    /** Chain ID hash (bytes32, raw) */
    chainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved via lookup table) */
    caip2ChainId: t.text().notNull(),
    /** Numeric chain ID (EVM only, null for non-EVM) */
    numericChainId: t.integer(),
    /** Registration transaction hash (join key to parent batch) */
    transactionHash: t.hex().notNull(),
    /** Reporter address */
    reporter: t.hex().notNull(),
    /** When batch was registered */
    reportedAt: t.bigint().notNull(),
    /** Reference to parent batch (populated by batch summary handler or at query time) */
    batchId: t.text(),
  }),
  (table) => ({
    txHashIdx: index().on(table.txHash),
    caip2ChainIdIdx: index().on(table.caip2ChainId),
    batchIdIdx: index().on(table.batchId),
    txnHashIdx: index().on(table.transactionHash),
  })
);

/** Pending transaction batch acknowledgements */
export const transactionBatchAcknowledgement = onchainTable(
  'transaction_batch_acknowledgement',
  (t) => ({
    /** reporter address as primary key (only one pending ack per reporter) */
    id: t.hex().primaryKey(),
    /** dataHash = hash of (txHashes, chainIds) committed in acknowledgement */
    dataHash: t.hex().notNull(),
    /** Reporter address */
    reporter: t.hex().notNull(),
    /** Trusted forwarder address */
    trustedForwarder: t.hex().notNull(),
    /** Was gas sponsored? */
    isSponsored: t.boolean().notNull(),
    /** Block timestamp when acknowledged */
    acknowledgedAt: t.bigint().notNull(),
    /** Block number when acknowledged */
    acknowledgedAtBlock: t.bigint().notNull(),
    /** Acknowledgement transaction hash */
    transactionHash: t.hex().notNull(),
    /** Calculated grace period start block */
    gracePeriodStart: t.bigint().notNull(),
    /** Calculated grace period end block */
    gracePeriodEnd: t.bigint().notNull(),
    /** Status: pending, registered, expired */
    status: t.text().notNull(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/** Correlate spoke -> hub message flow */
export const crossChainMessage = onchainTable(
  'cross_chain_message',
  (t) => ({
    /** messageId (Hyperlane message ID) */
    id: t.hex().primaryKey(),
    /** Origin chain ID (numeric) */
    sourceChainId: t.integer().notNull(),
    /** Destination chain ID (always hub) */
    targetChainId: t.integer().notNull(),
    /** Wallet address (for wallet registrations) */
    wallet: t.hex(),
    /** Batch ID (for transaction registrations) */
    batchId: t.hex(),
    /** Transaction hash on spoke chain */
    spokeTxHash: t.hex(),
    /** Transaction hash on hub chain */
    hubTxHash: t.hex(),
    /** Status: sent, received, registered */
    status: t.text().notNull(),
    /** When sent from spoke */
    sentAt: t.bigint(),
    /** When received on hub */
    receivedAt: t.bigint(),
    /** When registration completed */
    registeredAt: t.bigint(),
    /** Bridge protocol ID */
    bridgeId: t.integer(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
    walletIdx: index().on(table.wallet),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND TOKENS
// ═══════════════════════════════════════════════════════════════════════════

/** Wallet Soulbound NFTs (minted to registered stolen wallet owners) */
export const walletSoulboundToken = onchainTable(
  'wallet_soulbound_token',
  (t) => ({
    /** tokenId as string */
    id: t.text().primaryKey(),
    /** The stolen wallet address */
    wallet: t.hex().notNull(),
    /** Who minted (usually same as wallet) */
    minter: t.hex().notNull(),
    /** Block timestamp when minted */
    mintedAt: t.bigint().notNull(),
    /** Block number when minted */
    mintedAtBlock: t.bigint().notNull(),
    /** Mint transaction hash */
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    walletIdx: index().on(table.wallet),
  })
);

/** Support Soulbound NFTs (minted to donors/supporters) */
export const supportSoulboundToken = onchainTable(
  'support_soulbound_token',
  (t) => ({
    /** tokenId as string */
    id: t.text().primaryKey(),
    /** Supporter address */
    supporter: t.hex().notNull(),
    /** Donation amount in wei */
    amount: t.bigint().notNull(),
    /** Block timestamp when minted */
    mintedAt: t.bigint().notNull(),
    /** Block number when minted */
    mintedAtBlock: t.bigint().notNull(),
    /** Mint transaction hash */
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    supporterIdx: index().on(table.supporter),
    amountIdx: index().on(table.amount),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// OPERATOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/** DAO-approved operators who can batch-submit fraud data */
export const operator = onchainTable(
  'operator',
  (t) => ({
    /** Operator address (lowercase) */
    id: t.hex().primaryKey(),
    /** Human-readable identifier (e.g., "Coinbase", "ZachXBT") */
    identifier: t.text().notNull(),
    /** Capabilities bitmask: 0x01=wallet, 0x02=tx, 0x04=contract */
    capabilities: t.integer().notNull(),
    /** Is currently approved */
    approved: t.boolean().notNull(),
    /** Block number when approved */
    approvedAt: t.bigint().notNull(),
    /** Block number when revoked (null if active) */
    revokedAt: t.bigint(),
    /** Approval transaction hash */
    approvalTxHash: t.hex().notNull(),
    /** Can submit to wallet registry */
    canSubmitWallet: t.boolean().notNull(),
    /** Can submit to transaction registry */
    canSubmitTransaction: t.boolean().notNull(),
    /** Can submit to contract registry */
    canSubmitContract: t.boolean().notNull(),
  }),
  (table) => ({
    approvedIdx: index().on(table.approved),
    identifierIdx: index().on(table.identifier),
  })
);

/** History of operator capability changes */
export const operatorCapabilityChange = onchainTable(
  'operator_capability_change',
  (t) => ({
    /** txHash-logIndex composite */
    id: t.text().primaryKey(),
    /** Operator address */
    operator: t.hex().notNull(),
    /** Old capabilities */
    oldCapabilities: t.integer().notNull(),
    /** New capabilities */
    newCapabilities: t.integer().notNull(),
    /** Block timestamp */
    changedAt: t.bigint().notNull(),
    /** Transaction hash */
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    operatorIdx: index().on(table.operator),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// FRAUDULENT CONTRACT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/** Batches of fraudulent contracts submitted by operators (ContractBatchCreated) */
export const fraudulentContractBatch = onchainTable(
  'fraudulent_contract_batch',
  (t) => ({
    /** uint256 batchId as string */
    id: t.text().primaryKey(),
    /** Operator ID (bytes32 hash of operator name) */
    operatorId: t.hex().notNull(),
    /** Operator address (from event.transaction.from) */
    operator: t.hex().notNull(),
    /** Reported chain CAIP-2 (resolved from first contract in batch) */
    reportedChainCAIP2: t.text(),
    /** Actual contract count */
    contractCount: t.integer().notNull(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    operatorIdx: index().on(table.operator),
    registeredAtIdx: index().on(table.registeredAt),
  })
);

/** Individual fraudulent contracts (extracted from ContractRegistered events) */
export const fraudulentContract = onchainTable(
  'fraudulent_contract',
  (t) => ({
    /** contractAddress-chainIdHash composite */
    id: t.text().primaryKey(),
    /** Contract address */
    contractAddress: t.hex().notNull(),
    /** Chain ID hash (bytes32) */
    chainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved) */
    caip2ChainId: t.text().notNull(),
    /** Numeric chain ID (EVM only) */
    numericChainId: t.integer(),
    /** Parent batch ID (uint256 as string) */
    batchId: t.text().notNull(),
    /** Operator who submitted */
    operator: t.hex().notNull(),
    /** When batch was registered */
    reportedAt: t.bigint().notNull(),
  }),
  (table) => ({
    contractAddressIdx: index().on(table.contractAddress),
    caip2ChainIdIdx: index().on(table.caip2ChainId),
    batchIdIdx: index().on(table.batchId),
    operatorIdx: index().on(table.operator),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

/** Registry statistics (global and per-chain) */
export const registryStats = onchainTable('registry_stats', (t) => ({
  /** 'global', 'chain-31337', etc. */
  id: t.text().primaryKey(),
  /** Total wallet registrations */
  totalWalletRegistrations: t.integer().notNull(),
  /** Total transaction batches */
  totalTransactionBatches: t.integer().notNull(),
  /** Sum of all tx counts in batches */
  totalTransactionsReported: t.integer().notNull(),
  /** Sponsored registrations */
  sponsoredRegistrations: t.integer().notNull(),
  /** Direct registrations */
  directRegistrations: t.integer().notNull(),
  /** Cross-chain registrations */
  crossChainRegistrations: t.integer().notNull(),
  /** Wallet soulbounds minted */
  walletSoulboundsMinted: t.integer().notNull(),
  /** Support soulbounds minted */
  supportSoulboundsMinted: t.integer().notNull(),
  /** Total wei donated */
  totalSupportDonations: t.bigint().notNull(),
  /** Total operator approvals */
  totalOperators: t.integer().notNull(),
  /** Active operators */
  activeOperators: t.integer().notNull(),
  /** Total operator wallet batches */
  totalWalletBatches: t.integer().notNull(),
  /** Total operator transaction batches */
  totalOperatorTransactionBatches: t.integer().notNull(),
  /** Total fraudulent contract batches */
  totalContractBatches: t.integer().notNull(),
  /** Total individual fraudulent contracts reported */
  totalFraudulentContracts: t.integer().notNull(),
  /** Last update timestamp */
  lastUpdated: t.bigint().notNull(),
}));

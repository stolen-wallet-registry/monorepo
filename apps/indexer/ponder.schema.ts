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
    /** If from operator batch, the batch ID */
    batchId: t.hex(),
    /** If from operator batch, the operator address */
    operator: t.hex(),
    /** If cross-chain, source chain ID (numeric) */
    sourceChainId: t.integer(),
    /** If cross-chain, CAIP-2 string of source chain */
    sourceChainCAIP2: t.text(),
    /** If cross-chain, Hyperlane message ID */
    messageId: t.hex(),
  }),
  (table) => ({
    caip10Idx: index().on(table.caip10),
    registeredAtIdx: index().on(table.registeredAt),
    batchIdIdx: index().on(table.batchId),
  })
);

/** Operator-submitted wallet batches */
export const walletBatch = onchainTable(
  'wallet_batch',
  (t) => ({
    /** batchId (bytes32 as hex string) */
    id: t.hex().primaryKey(),
    /** Merkle root of wallet addresses */
    merkleRoot: t.hex().notNull(),
    /** Operator who submitted */
    operator: t.hex().notNull(),
    /** Reported chain ID (bytes32 hash) */
    reportedChainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved) */
    reportedChainCAIP2: t.text(),
    /** Number of wallets in batch */
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
    forwarder: t.hex().notNull(),
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

/** Transaction batch (Merkle root + metadata) */
export const transactionBatch = onchainTable(
  'transaction_batch',
  (t) => ({
    /** batchId (bytes32 as hex string) */
    id: t.hex().primaryKey(),
    /** Merkle root of tx hashes */
    merkleRoot: t.hex().notNull(),
    /** Address that reported */
    reporter: t.hex().notNull(),
    /** Chain where txs occurred (bytes32 hash) */
    reportedChainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved) */
    reportedChainCAIP2: t.text(),
    /** Number of txs in batch */
    transactionCount: t.integer().notNull(),
    /** Was gas sponsored? */
    isSponsored: t.boolean().notNull(),
    /** Has an operator verified? */
    isOperatorVerified: t.boolean().notNull(),
    /** Verifying operator address (if verified) */
    verifyingOperator: t.hex(),
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
  })
);

/**
 * Individual transactions in a batch (for querying "is this tx reported?")
 * CRITICAL: These are extracted from event data, not from contract storage
 */
export const transactionInBatch = onchainTable(
  'transaction_in_batch',
  (t) => ({
    /** txHash-caip2ChainId composite key */
    id: t.text().primaryKey(),
    /** Transaction hash (bytes32) */
    txHash: t.hex().notNull(),
    /** Chain ID hash (bytes32, raw) */
    chainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved via lookup table) */
    caip2ChainId: t.text().notNull(),
    /** Numeric chain ID (EVM only, null for non-EVM) */
    numericChainId: t.integer(),
    /** Reference to parent batch */
    batchId: t.hex().notNull(),
    /** Reporter address */
    reporter: t.hex().notNull(),
    /** When batch was registered */
    reportedAt: t.bigint().notNull(),
  }),
  (table) => ({
    txHashIdx: index().on(table.txHash),
    caip2ChainIdIdx: index().on(table.caip2ChainId),
    batchIdIdx: index().on(table.batchId),
  })
);

/** Pending transaction batch acknowledgements */
export const transactionBatchAcknowledgement = onchainTable(
  'transaction_batch_acknowledgement',
  (t) => ({
    /** Computed batchId: keccak256(merkleRoot, reporter, reportedChainId) */
    id: t.hex().primaryKey(),
    /** Merkle root of tx hashes */
    merkleRoot: t.hex().notNull(),
    /** Reporter address */
    reporter: t.hex().notNull(),
    /** Trusted forwarder address */
    forwarder: t.hex().notNull(),
    /** Chain where txs occurred (bytes32 hash) */
    reportedChainIdHash: t.hex().notNull(),
    /** Number of txs in batch */
    transactionCount: t.integer().notNull(),
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

/** Batches of fraudulent contracts submitted by operators */
export const fraudulentContractBatch = onchainTable(
  'fraudulent_contract_batch',
  (t) => ({
    /** batchId (bytes32 as hex) */
    id: t.hex().primaryKey(),
    /** Merkle root of contracts */
    merkleRoot: t.hex().notNull(),
    /** Operator who submitted */
    operator: t.hex().notNull(),
    /** Primary chain for batch (CAIP-2 bytes32 hash) */
    reportedChainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved) */
    reportedChainCAIP2: t.text(),
    /** Number of contracts in batch */
    contractCount: t.integer().notNull(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
    /** Has batch been invalidated */
    invalidated: t.boolean().notNull(),
    /** Block when invalidated (null if valid) */
    invalidatedAt: t.bigint(),
  }),
  (table) => ({
    operatorIdx: index().on(table.operator),
    registeredAtIdx: index().on(table.registeredAt),
    invalidatedIdx: index().on(table.invalidated),
  })
);

/** Individual fraudulent contracts (extracted from batch events) */
export const fraudulentContract = onchainTable(
  'fraudulent_contract',
  (t) => ({
    /** contractAddress-chainIdHash composite */
    id: t.text().primaryKey(),
    /**
     * Entry hash for joining with invalidatedEntry table (keccak256(address, chainId)).
     * To check invalidation status, join: fraudulentContract.entryHash = invalidatedEntry.id
     */
    entryHash: t.hex().notNull(),
    /** Contract address */
    contractAddress: t.hex().notNull(),
    /** Chain ID hash (bytes32) */
    chainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved) */
    caip2ChainId: t.text().notNull(),
    /** Numeric chain ID (EVM only) */
    numericChainId: t.integer(),
    /** Parent batch ID */
    batchId: t.hex().notNull(),
    /** Operator who submitted */
    operator: t.hex().notNull(),
    /** When batch was registered */
    reportedAt: t.bigint().notNull(),
  }),
  (table) => ({
    entryHashIdx: index().on(table.entryHash),
    contractAddressIdx: index().on(table.contractAddress),
    caip2ChainIdIdx: index().on(table.caip2ChainId),
    batchIdIdx: index().on(table.batchId),
    operatorIdx: index().on(table.operator),
  })
);

/** Invalidated entries (individual contract+chain combinations) */
export const invalidatedEntry = onchainTable('invalidated_entry', (t) => ({
  /** entryHash (keccak256(contract, chainId)) */
  id: t.hex().primaryKey(),
  /** When invalidated */
  invalidatedAt: t.bigint().notNull(),
  /** Who invalidated */
  invalidatedBy: t.hex().notNull(),
  /** Transaction hash */
  transactionHash: t.hex().notNull(),
  /** Has been reinstated */
  reinstated: t.boolean().notNull(),
  /** When reinstated (null if still invalid) */
  reinstatedAt: t.bigint(),
}));

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
  /** Invalidated contract batches */
  invalidatedContractBatches: t.integer().notNull(),
  /** Last update timestamp */
  lastUpdated: t.bigint().notNull(),
}));

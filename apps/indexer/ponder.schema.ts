import { index, onchainTable } from 'ponder';

// ═══════════════════════════════════════════════════════════════════════════
// WALLET REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/** Registered stolen wallets */
export const stolenWallet = onchainTable(
  'stolen_wallet',
  (t) => ({
    /**
     * The FULL bytes32 identifier from the event (lowercase, zero-padded).
     *
     * PREVENTED by this key: 20-byte truncation collisions. `CAIP10.walletKey` supports
     * non-eip155 namespaces whose identifiers use all 32 bytes, so truncating to 20 bytes
     * would let two distinct non-EVM accounts sharing a 20-byte suffix collide onto one row
     * (and `.onConflictDoNothing()` would silently drop the second registration). Use
     * `walletAddress` for EVM display/lookup.
     *
     * NOT PREVENTED — REVISIT BEFORE ANY NON-EVM SPOKE SHIPS: the same identifier registered
     * under two different non-EVM chain references, or under two different namespaces. The
     * contract's key for those is `CAIP10.walletKey(namespaceHash, chainRefHash, identifier)`
     * (`WalletRegistry.registerFromHub`) — chain- and namespace-scoped — while this key is the
     * identifier alone. Only the eip155 branch is genuinely chain-wildcarded, so for EVM the
     * two agree; for anything else they do not. Consequences today: the second registration's
     * `WalletRegistered` is dropped by `.onConflictDoNothing()`, and the `CrossChainWalletRegistered`
     * handler's unconditional `db.update` then overwrites the FIRST row's `sourceChainId` /
     * `sourceChainCAIP2` / `bridgeId` / `messageId` with the second message's provenance.
     *
     * Unreachable while every spoke is EVM, which is why this is documented rather than fixed:
     * the fix is a primary-key change (identifier + namespaceHash + chainRefHash), i.e. a
     * schema migration and a re-index. Do it as part of non-EVM spoke support, not after.
     */
    id: t.hex().primaryKey(),
    /** EVM address (lowercase) when the identifier is EVM-shaped, else null */
    walletAddress: t.hex(),
    /**
     * Display CAIP-10. EVM wallets use the wildcard chain reference "eip155:*:0x..."
     * because the contract's wallet storage key is deliberately chain-wildcarded — a
     * stolen wallet is stolen on every EVM chain. Use `reportedChainCAIP2` for the chain
     * the incident was reported on.
     */
    caip10: t.text().notNull(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
    /** Was gas sponsored (relay)? */
    isSponsored: t.boolean().notNull(),
    /** If from operator batch, the operator address (back-filled by the BatchCreated handler) */
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
    /**
     * If from operator batch, the batch ID (uint256 as string).
     * `WalletRegistered` carries no batchId (zero per-entry gas), so this is back-filled
     * by the `BatchCreated` handler via the shared transactionHash.
     */
    batchId: t.text(),
  }),
  (table) => ({
    walletAddressIdx: index().on(table.walletAddress),
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
    /** Operator ID: bytes32(uint256(uint160(operatorAddress))) — see OperatorSubmitter._getOperatorId */
    operatorId: t.hex().notNull(),
    /** Operator address, decoded from operatorId (NOT event.transaction.from) */
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
    /**
     * Status: pending | registered | superseded.
     *
     * `registered` means THIS acknowledgement completed its own two-phase flow: the
     * registeree signed the second message and `WalletRegistered` followed.
     *
     * `superseded` means the wallet ended up registered by some other route — in practice an
     * operator batch covering the same wallet — while this acknowledgement was still pending.
     * The registration is real and the pending ack is moot, but the registeree never signed
     * the second message, so recording it as `registered` claimed a signature that does not
     * exist. Display-only today; the distinction matters the moment anything counts completed
     * two-phase flows.
     *
     * There is deliberately no grace-period window here. The contract derives it from
     * `TimingConfig` with a per-acknowledgement random component and does NOT put the
     * result on `WalletAcknowledged`, so the indexer cannot know it — the columns that
     * used to be here served fabricated `block.number + 5 / + 20` constants to clients.
     * There is also no 'expired' status: expiry is a function of the current block, so
     * clients must evaluate it against the contract (`deadlines.isExpired`) rather than
     * against a value the indexer would have to guess.
     */
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
    /** Operator ID (only for operator batches): bytes32(uint256(uint160(operatorAddress))) */
    operatorId: t.hex(),
    /** Block timestamp when registered */
    registeredAt: t.bigint().notNull(),
    /** Block number when registered */
    registeredAtBlock: t.bigint().notNull(),
    /** Registration transaction hash */
    transactionHash: t.hex().notNull(),
    /**
     * Cross-chain provenance, mirroring the same four columns on `stolenWallet`.
     *
     * `TransactionBatchRegistered` carries none of this — the batch summary fires AFTER the
     * per-entry `CrossChainTransactionRegistered` events in the same tx, so the batch handler
     * reads them back off the `crossChainMessage` row keyed by `hubTxHash`. All four are NULL
     * for a locally-registered batch, which is how "was this delivered from a spoke?" is
     * answered; before they were written, a cross-chain batch was byte-identical to a local one.
     */
    sourceChainId: t.integer(),
    /** If cross-chain, CAIP-2 string of the source chain */
    sourceChainCAIP2: t.text(),
    /** If cross-chain, bridge protocol ID (0=local, 1=Hyperlane) */
    bridgeId: t.integer(),
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
    /**
     * Reporter address — MEANINGFUL ONLY FOR INDIVIDUAL BATCHES.
     *
     * The operator path emits `TransactionRegistered(txHash, chainId, address(0), false)`
     * (TransactionRegistry.sol), so every entry submitted by an operator carries the zero
     * address here. Attribute operator entries through `batchId` →
     * `transactionBatch.operatorId` / `.operator` instead; a query that groups this table by
     * `reporter` silently lumps every operator submission in the registry into one bogus
     * 0x000…0 bucket.
     */
    reporter: t.hex().notNull(),
    /** When batch was registered */
    reportedAt: t.bigint().notNull(),
    /**
     * Parent batch ID. `TransactionRegistered` carries no batchId (zero per-entry gas),
     * so this is back-filled by the batch summary handler (TransactionBatchRegistered /
     * TransactionBatchCreated) via the shared transactionHash.
     */
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
    /**
     * Status: pending | registered | superseded — see `walletAcknowledgement.status` for why
     * there is no grace-period window here.
     *
     * `registered` is claimed ONLY when the batch that registered carries the same `dataHash`
     * this acknowledgement committed to. That is an exact discriminator, not a heuristic:
     * `TransactionRegistry.registerTransactions` reverts with `DataHashMismatch` unless the
     * two match, so a matching hash on a non-cross-chain batch IS this reporter's completed
     * two-phase flow.
     *
     * `superseded` is the same idea as on the wallet side: the exact batch this reporter
     * committed to got registered by another route (a spoke delivery for the same reporter and
     * the same dataHash) while the acknowledgement was still pending. The registration is real,
     * the pending ack is moot, but the reporter never signed the second message.
     *
     * A batch with a DIFFERENT dataHash leaves this row `pending` and untouched. It registers
     * other transactions entirely and does not consume the on-chain acknowledgement, so the
     * reporter can still complete their own flow — recording either `registered` (a signature
     * that does not exist) or `superseded` (a completion that never happened) would be false.
     */
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
    /**
     * Origin chain ID (numeric) — OR a Hyperlane domain, see {@link sourceChainIsDomain}.
     *
     * The inbox handlers only receive the Hyperlane `origin` domain and map it through
     * `hyperlaneDomainToCAIP2`. For every chain @swr/chains knows, that yields a real numeric
     * chain ID. For one it does not, the handlers fall back to the raw domain rather than
     * writing 0, because a domain is still a usable correlation key — but the two are
     * different numbering spaces, and a consumer that renders this as a chain ID (or joins it
     * against one) is wrong in exactly that case. Read `sourceChainIsDomain` before doing
     * either.
     */
    sourceChainId: t.integer().notNull(),
    /**
     * True when {@link sourceChainId} holds a Hyperlane domain rather than a chain ID.
     *
     * The fallback was previously documented only in the handler, three files away from where
     * anyone reads the column.
     */
    sourceChainIsDomain: t.boolean(),
    /**
     * CAIP-2 string of the source chain, or null when the chain is unknown to @swr/chains.
     *
     * Unlike {@link sourceChainId} this is never ambiguous — it is only ever written when the
     * chain actually resolved, so there is no domain-vs-chain-ID reading to get wrong. It also
     * saves the transaction-batch handler from having to invert `sourceChainId` back into a
     * CAIP-2 string, which it could not do correctly for the domain-fallback case.
     */
    sourceChainCAIP2: t.text(),
    /** Destination chain ID (always hub) */
    targetChainId: t.integer().notNull(),
    /** Wallet address (for wallet registrations) */
    wallet: t.hex(),
    /**
     * Batch ID (for transaction registrations), uint256 as string.
     *
     * `t.text()` to match `transactionBatch.id` and `transactionInBatch.batchId`. Not yet
     * written on this table: the hub only learns the real batchId when
     * TransactionBatchRegistered fires, and the inbox's dataHash is a content commitment,
     * not a batch ID.
     */
    batchId: t.text(),
    /** Transaction hash on hub chain (inbox delivery and registration are the same tx) */
    hubTxHash: t.hex(),
    /** Status: received, registered */
    status: t.text().notNull(),
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
    // The transaction-batch handler looks a message up by the hub tx it was delivered in —
    // the only key it has, since `TransactionBatchRegistered` carries no messageId.
    hubTxHashIdx: index().on(table.hubTxHash),
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
    /** Operator ID: bytes32(uint256(uint160(operatorAddress))) — see OperatorSubmitter._getOperatorId */
    operatorId: t.hex().notNull(),
    /** Operator address, decoded from operatorId (NOT event.transaction.from) */
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
    /**
     * identifier-chainIdHash composite, where `identifier` is the FULL bytes32 from the
     * event. Keyed on the full identifier (not the truncated address) so two non-EVM
     * contract identifiers sharing a 20-byte suffix cannot collide onto one row.
     */
    id: t.text().primaryKey(),
    /** Raw bytes32 identifier from ContractRegistered */
    identifier: t.hex().notNull(),
    /**
     * Contract address (lowercase), the low 20 bytes of `identifier`.
     *
     * Always populated and always truncated, because ContractRegistry's only registration
     * entrypoint truncates unconditionally too — the truncated address IS the on-chain
     * identity for contract entries. `identifier` preserves the full emitted value.
     */
    contractAddress: t.hex().notNull(),
    /** Chain ID hash (bytes32) */
    chainIdHash: t.hex().notNull(),
    /** CAIP-2 chain ID (resolved) */
    caip2ChainId: t.text().notNull(),
    /** Numeric chain ID (EVM only) */
    numericChainId: t.integer(),
    /** Parent batch ID (uint256 as string) */
    batchId: t.text().notNull(),
    /** Operator address, decoded from the event's operatorId (NOT event.transaction.from) */
    operator: t.hex().notNull(),
    /** Threat category (0=unclassified, 1=drainer, 2=rug pull, 3=honeypot, 4=ponzi, 5=fake token) */
    threatCategory: t.integer().notNull().default(0),
    /** When batch was registered */
    reportedAt: t.bigint().notNull(),
  }),
  (table) => ({
    // The primary key is `${identifier}-${chainIdHash}`, so a lookup by identifier alone
    // (the reason the column exists at all: non-EVM contracts that do not reduce to an
    // address) cannot use it. Without this index that lookup is a sequential scan.
    identifierIdx: index().on(table.identifier),
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
  /** Total transaction batches — individual AND operator (superset of totalOperatorTransactionBatches) */
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
  /** Operator-submitted transaction batches (subset of totalTransactionBatches) */
  totalOperatorTransactionBatches: t.integer().notNull(),
  /** Total fraudulent contract batches */
  totalContractBatches: t.integer().notNull(),
  /** Total individual fraudulent contracts reported */
  totalFraudulentContracts: t.integer().notNull(),
  /** Last update timestamp */
  lastUpdated: t.bigint().notNull(),
}));

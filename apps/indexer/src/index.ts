import { ponder } from 'ponder:registry';
import {
  stolenWallet,
  walletAcknowledgement,
  walletBatch,
  transactionBatch,
  transactionInBatch,
  transactionBatchAcknowledgement,
  crossChainMessage,
  walletSoulboundToken,
  supportSoulboundToken,
  registryStats,
  operator,
  operatorCapabilityChange,
  fraudulentContractBatch,
  fraudulentContract,
} from 'ponder:schema';
import {
  resolveChainIdHash,
  caip2ToNumericChainId,
  hyperlaneDomainToCAIP2,
  anvilHub,
  baseSepolia,
  base,
  type Environment,
} from '@swr/chains';
import { type Address, type Hex } from 'viem';
import { and, eq, isNotNull, isNull } from 'ponder';
import {
  identifierToAddress,
  normalizeIdentifier,
  truncateToAddress,
  walletCaip10,
} from './lib/identifiers';
import { resolveTransactionAckStatus, type TransactionAckStatus } from './lib/acknowledgements';
import { applyStatsDelta, type StatsDelta } from './lib/stats';
import { readPonderEnv } from './lib/env';
import { transactionBackfillValues, walletBackfillValues } from './lib/backfill';

// Hub chain configuration - determined by environment.
// Shares ponder.config.ts's validated read (src/lib/env.ts): an unrecognised PONDER_ENV must
// fail here too, not silently index `HUB_CHAIN_ID === undefined`.
const PONDER_ENV = readPonderEnv();

const HUB_CHAIN_IDS: Record<Environment, number> = {
  development: anvilHub.chainId,
  staging: baseSepolia.chainId,
  production: base.chainId,
};

const HUB_CHAIN_ID = HUB_CHAIN_IDS[PONDER_ENV];

/**
 * Resolve the operator address from the event's `operatorId`.
 *
 * `OperatorSubmitter._getOperatorId()` is `bytes32(uint256(uint160(msg.sender)))`, so the
 * operatorId IS the authoritative submitter. `event.transaction.from` is not: it is the
 * relayer/multisig/AA account that paid for the tx.
 *
 * Falls back to `event.transaction.from` only if the operatorId is not address-shaped
 * (should not happen today, but the column is notNull).
 */
function resolveOperator(operatorId: Hex, txFrom: Address): Address {
  return identifierToAddress(operatorId) ?? (txFrom.toLowerCase() as Address);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Update global stats
// ═══════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Ponder's db context type is internal; using any avoids coupling to unstable Ponder internals
async function updateGlobalStats(db: any, delta: StatsDelta, timestamp: bigint) {
  const id = 'global';

  // Read-then-write: Ponder processes events sequentially per chain,
  // so no race condition is possible within a single chain's event stream.
  // (The previous sql`column + delta` upsert pattern caused Ponder 0.16.x's
  // hasProxy/copy utility to hit infinite recursion on drizzle column references.)
  const existing = await db.find(registryStats, { id });
  const next = applyStatsDelta(existing, delta, timestamp);

  if (existing) {
    await db.update(registryStats, { id }).set(next);
  } else {
    await db.insert(registryStats).values({ id, ...next });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// WalletAcknowledged — tracks pending acknowledgements in grace period
ponder.on('WalletRegistry:WalletAcknowledged', async ({ event, context }) => {
  const { registeree, trustedForwarder, isSponsored } = event.args;
  const { db } = context;

  // No gracePeriodStart/End here: the contract derives the window from TimingConfig with
  // a per-acknowledgement random component and does not emit it, so any value the indexer
  // wrote would be invented. Clients read the real window from the contract.
  await db
    .insert(walletAcknowledgement)
    .values({
      id: registeree.toLowerCase() as Address,
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      status: 'pending',
    })
    .onConflictDoUpdate({
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      status: 'pending',
    });
});

// WalletRegistered — fires for individual, operator, AND cross-chain registrations
// NOTE: This event does NOT carry a batchId or operator (zero per-entry gas impact).
// For operator batches, the BatchCreated handler fires later in the same tx and back-fills
// both columns via the shared transactionHash.
ponder.on('WalletRegistry:WalletRegistered', async ({ event, context }) => {
  const { identifier, reportedChainId, incidentTimestamp, isSponsored } = event.args;
  const { db } = context;

  // Key on the FULL bytes32. Non-EVM identifiers use all 32 bytes, so truncating to an
  // address would let two distinct accounts collide and .onConflictDoNothing() would
  // silently drop the second registration.
  const id = normalizeIdentifier(identifier);
  const walletAddress = identifierToAddress(identifier);
  const reportedChainCAIP2 = resolveChainIdHash(reportedChainId);

  await db
    .insert(stolenWallet)
    .values({
      id,
      walletAddress,
      // Wildcard chain reference: the contract's wallet key is chain-wildcarded for
      // eip155, so pinning the hub chain here made every CAIP-10 search miss.
      caip10: walletCaip10(identifier, reportedChainCAIP2),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      reportedChainId,
      reportedChainCAIP2,
      incidentTimestamp: BigInt(incidentTimestamp),
    })
    .onConflictDoNothing();

  // Mark pending acknowledgement as registered.
  // Acknowledgements are keyed by the registeree EOA, so this only applies to EVM wallets.
  if (walletAddress) {
    const pending = await db.find(walletAcknowledgement, { id: walletAddress });
    if (pending) {
      await db.update(walletAcknowledgement, { id: walletAddress }).set({ status: 'registered' });
    }
  }

  await updateGlobalStats(
    db,
    {
      walletRegistrations: 1,
      sponsored: isSponsored ? 1 : 0,
    },
    event.block.timestamp
  );
});

// CrossChainWalletRegistered — fires alongside WalletRegistered for cross-chain
// Use this to UPDATE the wallet record with cross-chain metadata
ponder.on('WalletRegistry:CrossChainWalletRegistered', async ({ event, context }) => {
  const { identifier, sourceChainId, bridgeId, messageId } = event.args;
  const { db } = context;

  const id = normalizeIdentifier(identifier);
  const walletAddress = identifierToAddress(identifier);
  const sourceCAIP2 = resolveChainIdHash(sourceChainId);
  const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

  // Update the wallet record that WalletRegistered already inserted
  await db.update(stolenWallet, { id }).set({
    sourceChainId: sourceNumeric,
    sourceChainCAIP2: sourceCAIP2,
    bridgeId,
    messageId,
  });

  // Cross-chain message tracking — insert-or-update, NOT find-then-update.
  //
  // CrossChainInbox emits WalletRegistrationReceived only AFTER it has delegated to the
  // registries, so this handler runs first and the row does not exist yet. The previous
  // find-then-update therefore always found nothing: status never advanced past 'received'
  // and hubTxHash/registeredAt stayed NULL for every cross-chain registration.
  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      sourceChainId: sourceNumeric ?? 0,
      // 0 is the unknown-chain sentinel, not a domain: this handler has only the bytes32
      // chain hash. The inbox handler repairs it with the real origin domain if it can.
      sourceChainIsDomain: false,
      sourceChainCAIP2: sourceCAIP2,
      targetChainId: HUB_CHAIN_ID,
      wallet: walletAddress,
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
      bridgeId,
    })
    .onConflictDoUpdate((row) => ({
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
      wallet: walletAddress ?? row.wallet,
      // Never clobber a resolved chain with an unresolved one — same rule as `wallet`.
      sourceChainCAIP2: sourceCAIP2 ?? row.sourceChainCAIP2,
      bridgeId,
    }));

  await updateGlobalStats(db, { crossChain: 1 }, event.block.timestamp);
});

// BatchCreated — operator wallet batch
// Fires AFTER all WalletRegistered events in the same tx.
// Use transactionHash to correlate wallets to this batch.
ponder.on('WalletRegistry:BatchCreated', async ({ event, context }) => {
  const { batchId, operatorId, walletCount } = event.args;
  const { db } = context;

  const batchIdStr = batchId.toString();
  const operatorAddress = resolveOperator(operatorId, event.transaction.from);

  // Derive reportedChainCAIP2 from any wallet entry in the same tx.
  // WalletRegistered events fire before BatchCreated in the same transaction,
  // so entries are already in the DB by the time this handler runs.
  // Note: operator batches CAN contain entries from multiple chains. This picks
  // an arbitrary entry's chain for display/filtering purposes. Multi-chain batches
  // will show one of possibly many chain IDs — this is acceptable for a convenience field.
  const walletEntries = await db.sql
    .select({ reportedChainCAIP2: stolenWallet.reportedChainCAIP2 })
    .from(stolenWallet)
    .where(eq(stolenWallet.transactionHash, event.transaction.hash))
    .limit(1);
  const reportedChainCAIP2 = walletEntries[0]?.reportedChainCAIP2 ?? null;

  // Insert batch record
  await db
    .insert(walletBatch)
    .values({
      id: batchIdStr,
      operatorId,
      operator: operatorAddress,
      reportedChainCAIP2,
      walletCount: Number(walletCount),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  // Back-fill batchId + operator onto the per-entry rows.
  //
  // WalletRegistered carries neither (deliberately — zero per-entry gas), so without this
  // the dashboard's wallet batch links and operator attribution were permanently NULL.
  // The transactionHash join is the documented correlation: every WalletRegistered in this
  // tx belongs to this batch (OperatorSubmitter makes one registry call per tx).
  //
  // Raw SQL is required because the write is keyed on transactionHash, not the primary key.
  // Ponder flushes + invalidates its indexing cache before a non-SELECT db.sql statement,
  // so the rows inserted earlier in this same tx are visible and are not clobbered later.
  //
  // The isNull guard makes the one-call-per-tx assumption safe rather than merely true
  // today: should a tx ever carry two batches (e.g. batched bridge delivery), the second
  // BatchCreated would otherwise re-tag the first batch's entries with its own id.
  //
  // COST (measured against ponder 0.16.1 — do not re-derive this from scratch):
  //   1. A non-SELECT `db.sql` runs `indexingCache.flush(); invalidate(); clear()`
  //      (indexing-store/index.js:400-405). That is the WHOLE cache, not the touched table,
  //      so every `db.find` after this statement re-reads Postgres until the cache refills.
  //   2. User indexes are created only AFTER the historical backfill completes
  //      (runtime/omnichain.js:317), so `WHERE transaction_hash = …` is a sequential scan for
  //      the entire backfill — `txHashIdx` does not exist yet.
  //   Together: O(batches × rows) during backfill, plus one full cache drop per batch.
  // This is accepted, not overlooked. Do not "fix" it by moving the write into the per-entry
  // handler — WalletRegistered does not carry the batchId, which is the whole point.
  await db.sql
    .update(stolenWallet)
    .set(walletBackfillValues(batchIdStr, operatorAddress))
    .where(
      and(eq(stolenWallet.transactionHash, event.transaction.hash), isNull(stolenWallet.batchId))
    );

  // Reclassify acknowledgements this batch ran over.
  //
  // The WalletRegistered handler marks a pending acknowledgement 'registered' whenever the
  // wallet gets registered, but an operator batch registers a wallet WITHOUT the registeree
  // ever signing the second message. Recording that as 'registered' claims a signature that
  // was never produced, which is the one thing the two-phase flow exists to make real.
  //
  // The join key is precise, not a heuristic: `stolenWallet.transactionHash` equals THIS tx
  // only for rows this batch actually created. A wallet that completed its own flow earlier
  // keeps its original registration tx hash (the insert above is `onConflictDoNothing`), so
  // its genuine 'registered' is never downgraded.
  const batchWallets = await db.sql
    .select({ walletAddress: stolenWallet.walletAddress })
    .from(stolenWallet)
    .where(
      and(
        eq(stolenWallet.transactionHash, event.transaction.hash),
        isNotNull(stolenWallet.walletAddress)
      )
    );

  const acknowledgedIds = batchWallets
    .map((row) => row.walletAddress)
    .filter((address): address is Address => address !== null);

  // Written through the KEYED store API, one row at a time, not as a bulk `db.sql.update`
  // (round-3 review D5a).
  //
  // Raw SQL bypasses the `_reorg__` operation log ponder replays to unwind a reorged block.
  // That is harmless for the `stolenWallet` back-fill above — those rows were INSERTED in this
  // same block, so the revert deletes them outright and takes the back-fill with them — but it
  // is not harmless here. A `walletAcknowledgement` row predates this block. Downgrading it
  // with raw SQL left nothing for the revert to undo, so a batch that got reorged away still
  // left its acknowledgements marked 'superseded' forever: a record that a two-phase flow was
  // pre-empted by a batch that no longer exists. `db.update` on the primary key is logged and
  // reverts cleanly.
  //
  // The row count is bounded by the batch's wallet count and every one of these keys was
  // already looked up once by the `WalletRegistered` handler earlier in this transaction, so
  // the finds are cache hits rather than new database work. Removing the raw statement also
  // removes one whole-cache flush + invalidate + clear per batch (see the COST note above),
  // which is a net saving, not a cost.
  for (const walletAddress of acknowledgedIds) {
    const ack = await db.find(walletAcknowledgement, { id: walletAddress });
    // Only a 'registered' ack is a claim that needs correcting. 'pending' means the registeree
    // never completed anything, and re-downgrading an already-'superseded' row is a no-op.
    if (ack?.status === 'registered') {
      await db.update(walletAcknowledgement, { id: walletAddress }).set({ status: 'superseded' });
    }
  }

  await updateGlobalStats(db, { totalWalletBatches: 1 }, event.block.timestamp);
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// TransactionBatchAcknowledged
ponder.on('TransactionRegistry:TransactionBatchAcknowledged', async ({ event, context }) => {
  const { reporter, trustedForwarder, dataHash, isSponsored } = event.args;
  const { db } = context;

  // See the wallet handler: the real grace window is not on the event.
  await db
    .insert(transactionBatchAcknowledgement)
    .values({
      id: reporter.toLowerCase() as Address,
      dataHash,
      reporter: reporter.toLowerCase() as Address,
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      isSponsored,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      status: 'pending',
    })
    .onConflictDoUpdate({
      dataHash,
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      isSponsored,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      status: 'pending',
    });
});

// TransactionRegistered — fires per tx for individual, operator, AND cross-chain
// NOTE: This event does NOT carry a batchId (zero per-entry gas impact).
// The batch summary event (TransactionBatchRegistered or TransactionBatchCreated) fires
// later in the same tx and back-fills batchId via the shared transactionHash.
ponder.on('TransactionRegistry:TransactionRegistered', async ({ event, context }) => {
  const { identifier, reportedChainId, reporter } = event.args;
  const { db } = context;

  const txHash = identifier; // bytes32 tx hash
  const chainIdHash = reportedChainId;
  const caip2ChainId = resolveChainIdHash(chainIdHash) ?? `unknown:${chainIdHash.slice(0, 10)}`;
  const numericChainId = caip2ToNumericChainId(caip2ChainId);

  await db
    .insert(transactionInBatch)
    .values({
      id: `${txHash}-${chainIdHash}`,
      txHash,
      chainIdHash,
      caip2ChainId,
      numericChainId,
      transactionHash: event.transaction.hash,
      reporter: reporter.toLowerCase() as Address,
      reportedAt: event.block.timestamp,
    })
    .onConflictDoNothing();
});

// TransactionBatchRegistered — individual + cross-chain batch summary
// Updated for Phase 0: event now includes uint256 indexed batchId as first param
ponder.on('TransactionRegistry:TransactionBatchRegistered', async ({ event, context }) => {
  const { batchId, reporter, dataHash, transactionCount, isSponsored } = event.args;
  const { db } = context;

  // Derive reportedChainCAIP2 from any transaction entry in the same tx.
  // TransactionRegistered events fire before TransactionBatchRegistered in the same transaction.
  // Note: batches CAN contain entries from multiple chains. This picks an arbitrary entry's
  // chain for display/filtering. Multi-chain batches show one of many possible chain IDs.
  // Both columns come from the same row: `reportedChainIdHash` was declared and never
  // written, so it was permanently NULL and any query filtering on the raw bytes32 hash
  // matched nothing. Select it alongside the resolved CAIP-2 form rather than dropping it.
  const txEntries = await db.sql
    .select({
      caip2ChainId: transactionInBatch.caip2ChainId,
      chainIdHash: transactionInBatch.chainIdHash,
    })
    .from(transactionInBatch)
    .where(eq(transactionInBatch.transactionHash, event.transaction.hash))
    .limit(1);
  const reportedChainCAIP2 = txEntries[0]?.caip2ChainId ?? null;
  const reportedChainIdHash = txEntries[0]?.chainIdHash ?? null;

  // Cross-chain provenance for this batch.
  //
  // `TransactionBatchRegistered` carries none — it is emitted once, AFTER the per-entry loop
  // (TransactionRegistry.sol:725 vs :693-694), so by the time this handler runs the
  // `CrossChainTransactionRegistered` handler has already written the `crossChainMessage` row
  // for this delivery. Its `hubTxHash` is this transaction: inbox delivery and registration are
  // the same tx, and a Hyperlane `Mailbox.process` call carries exactly one message, so this
  // lookup returns at most one row and it is unambiguously ours.
  //
  // A locally-registered batch matches nothing here and keeps all four columns NULL, which is
  // what makes "did this batch come from a spoke?" answerable at all — before this, a
  // cross-chain batch row was byte-identical to a local one.
  const crossChainRows = await db.sql
    .select({
      messageId: crossChainMessage.id,
      sourceChainId: crossChainMessage.sourceChainId,
      sourceChainCAIP2: crossChainMessage.sourceChainCAIP2,
      bridgeId: crossChainMessage.bridgeId,
    })
    .from(crossChainMessage)
    .where(eq(crossChainMessage.hubTxHash, event.transaction.hash))
    .limit(1);
  const crossChain = crossChainRows[0] ?? null;
  // 0 is the unknown-chain sentinel that handler writes, not a real chain ID — surface it as
  // NULL here rather than as chain 0. `sourceChainCAIP2` is only ever set when it resolved,
  // so it needs no such treatment.
  const sourceChainId =
    crossChain && crossChain.sourceChainId !== 0 ? crossChain.sourceChainId : null;

  await db
    .insert(transactionBatch)
    .values({
      id: batchId.toString(),
      dataHash,
      reporter: reporter.toLowerCase() as Address,
      reportedChainIdHash,
      reportedChainCAIP2,
      transactionCount: Number(transactionCount),
      isSponsored,
      isOperator: false,
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      sourceChainId,
      sourceChainCAIP2: crossChain?.sourceChainCAIP2 ?? null,
      bridgeId: crossChain?.bridgeId ?? null,
      messageId: crossChain?.messageId ?? null,
    })
    .onConflictDoNothing();

  // Back-fill batchId onto the per-entry rows (TransactionRegistered carries none).
  // See the wallet BatchCreated handler for why raw SQL is safe, why the isNull guard, and
  // what this costs during the historical backfill (full cache drop + sequential scan).
  await db.sql
    .update(transactionInBatch)
    .set(transactionBackfillValues(batchId))
    .where(
      and(
        eq(transactionInBatch.transactionHash, event.transaction.hash),
        isNull(transactionInBatch.batchId)
      )
    );

  // Resolve the reporter's pending acknowledgement.
  //
  // This used to mark ANY pending ack for this reporter 'registered', which is the transaction
  // twin of the wallet bug the `BatchCreated` handler fixes: a batch delivered from a spoke
  // also emits `TransactionBatchRegistered` with the reporter's address, so a reporter who was
  // mid-flow on the hub had their ack recorded as completed without ever signing the second
  // message — a claim to a signature that does not exist.
  //
  // `dataHash` is an EXACT discriminator, not a heuristic. `registerTransactions` reverts with
  // `TransactionRegistry__DataHashMismatch` unless the batch's dataHash equals the one the
  // acknowledgement committed to (TransactionRegistry.sol:598-600), so:
  //
  //   - hash matches, not cross-chain -> this IS the reporter's completed two-phase flow.
  //   - hash matches, cross-chain     -> the exact batch they committed to was registered by
  //                                      another route while their ack was pending. Real
  //                                      registration, no second signature: 'superseded',
  //                                      exactly as on the wallet side.
  //   - hash differs                  -> a different batch entirely. It does NOT consume the
  //                                      on-chain acknowledgement (the hub only deletes
  //                                      `_pendingAcknowledgements[reporter]` on that
  //                                      reporter's own `registerTransactions` call), so the
  //                                      reporter can still complete. Leave it 'pending' —
  //                                      'registered' would invent a signature and
  //                                      'superseded' would invent a completion.
  //
  // Only a 'pending' row is a live claim; re-deciding a settled one is not this event's job.
  //
  // The decision itself lives in `resolveTransactionAckStatus` so it is pinned by unit tests
  // rather than by this comment — see src/lib/acknowledgements.ts.
  const reporterAddr = reporter.toLowerCase() as Address;
  const pending = await db.find(transactionBatchAcknowledgement, { id: reporterAddr });
  const nextAckStatus = resolveTransactionAckStatus({
    current: (pending?.status as TransactionAckStatus | undefined) ?? null,
    committedDataHash: pending?.dataHash ?? null,
    batchDataHash: dataHash,
    isCrossChain: crossChain !== null,
  });
  if (nextAckStatus !== null) {
    await db
      .update(transactionBatchAcknowledgement, { id: reporterAddr })
      .set({ status: nextAckStatus });
  }

  await updateGlobalStats(
    db,
    {
      transactionBatches: 1,
      transactionsReported: Number(transactionCount),
      // Counted per delivered BATCH, not per transaction. The wallet counter increments once
      // per `CrossChainWalletRegistered`, which is once per wallet because `registerFromHub`
      // handles one wallet per message; the transaction equivalent of "one message" is one
      // batch. Incrementing in the `CrossChainTransactionRegistered` handler instead would add
      // one per entry and count a 500-tx batch as 500 cross-chain registrations.
      crossChain: crossChain ? 1 : 0,
    },
    event.block.timestamp
  );
});

// CrossChainTransactionRegistered — fires per tx alongside TransactionRegistered for cross-chain
ponder.on('TransactionRegistry:CrossChainTransactionRegistered', async ({ event, context }) => {
  const { sourceChainId, bridgeId, messageId } = event.args;
  const { db } = context;

  const sourceCAIP2 = resolveChainIdHash(sourceChainId);
  const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

  // Insert-or-update for the same reason as the wallet path above: CrossChainInbox emits
  // TransactionBatchReceived only after delegating, so this handler runs first and the row
  // does not exist yet.
  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      sourceChainId: sourceNumeric ?? 0,
      // 0 is the unknown-chain sentinel, not a domain: this handler has only the bytes32
      // chain hash. The inbox handler repairs it with the real origin domain if it can.
      sourceChainIsDomain: false,
      sourceChainCAIP2: sourceCAIP2,
      targetChainId: HUB_CHAIN_ID,
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
      bridgeId,
    })
    .onConflictDoUpdate((row) => ({
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
      // Never clobber a resolved chain with an unresolved one — see the wallet handler.
      sourceChainCAIP2: sourceCAIP2 ?? row.sourceChainCAIP2,
      bridgeId,
    }));
});

// TransactionBatchCreated — operator batch summary
ponder.on('TransactionRegistry:TransactionBatchCreated', async ({ event, context }) => {
  const { batchId, operatorId, transactionCount } = event.args;
  const { db } = context;

  const batchIdStr = batchId.toString();
  const operatorAddress = resolveOperator(operatorId, event.transaction.from);

  // Derive reportedChainCAIP2 from any transaction entry in the same tx.
  // TransactionRegistered events fire before TransactionBatchCreated in the same transaction.
  // Note: operator batches CAN contain entries from multiple chains (see BatchCreated comment).
  // `chainIdHash` travels with it — see TransactionBatchRegistered.
  const txEntries = await db.sql
    .select({
      caip2ChainId: transactionInBatch.caip2ChainId,
      chainIdHash: transactionInBatch.chainIdHash,
    })
    .from(transactionInBatch)
    .where(eq(transactionInBatch.transactionHash, event.transaction.hash))
    .limit(1);
  const reportedChainCAIP2 = txEntries[0]?.caip2ChainId ?? null;
  const reportedChainIdHash = txEntries[0]?.chainIdHash ?? null;

  await db
    .insert(transactionBatch)
    .values({
      id: batchIdStr,
      dataHash: ('0x' + '0'.repeat(64)) as Hex, // No dataHash for operator batches
      reporter: operatorAddress,
      reportedChainIdHash,
      reportedChainCAIP2,
      transactionCount: Number(transactionCount),
      isSponsored: false,
      isOperator: true,
      operatorId,
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  // Back-fill batchId onto the per-entry rows — see TransactionBatchRegistered.
  await db.sql
    .update(transactionInBatch)
    .set(transactionBackfillValues(batchIdStr))
    .where(
      and(
        eq(transactionInBatch.transactionHash, event.transaction.hash),
        isNull(transactionInBatch.batchId)
      )
    );

  await updateGlobalStats(
    db,
    {
      // Operator batches ARE transaction batches. Previously only the individual path
      // incremented `transactionBatches` while both incremented `transactionsReported`,
      // so the two counters rendered side by side on the dashboard were incomparable.
      transactionBatches: 1,
      totalOperatorTransactionBatches: 1,
      transactionsReported: Number(transactionCount),
    },
    event.block.timestamp
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// ContractRegistered — fires per contract (operator batches only)
ponder.on('ContractRegistry:ContractRegistered', async ({ event, context }) => {
  const { identifier, reportedChainId, operatorId, batchId, threatCategory } = event.args;
  const { db } = context;

  // Key on the FULL bytes32 identifier — see the WalletRegistered handler.
  const normalizedIdentifier = normalizeIdentifier(identifier);
  // ContractRegistry truncates unconditionally when computing its storage key, so the
  // truncated address is the on-chain identity here — mirror it rather than null it out.
  const contractAddress = truncateToAddress(identifier);
  const caip2ChainId =
    resolveChainIdHash(reportedChainId) ?? `unknown:${reportedChainId.slice(0, 10)}`;
  const numericChainId = caip2ToNumericChainId(caip2ChainId);

  await db
    .insert(fraudulentContract)
    .values({
      id: `${normalizedIdentifier}-${reportedChainId}`,
      identifier: normalizedIdentifier,
      contractAddress,
      chainIdHash: reportedChainId,
      caip2ChainId,
      numericChainId,
      batchId: batchId.toString(),
      operator: resolveOperator(operatorId, event.transaction.from),
      threatCategory,
      reportedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  // NO stats update here, deliberately. `updateGlobalStats` is a read-modify-write of the
  // single `registry_stats` row, and this handler runs once per contract in a batch — an
  // 800-entry submission did 800 sequential cycles on one row for a counter whose total is
  // already on `ContractBatchCreated` as `contractCount`. That event fires in the same tx
  // right after this loop, and `actualCount` there is exactly the number of
  // `ContractRegistered` events emitted (ContractRegistry.sol:151,160), so the batched
  // increment is not an approximation of this one — it is the same number.
});

// ContractBatchCreated — operator batch summary
ponder.on('ContractRegistry:ContractBatchCreated', async ({ event, context }) => {
  const { batchId, operatorId, contractCount } = event.args;
  const { db } = context;

  const batchIdStr = batchId.toString();
  const operatorAddress = resolveOperator(operatorId, event.transaction.from);

  // Derive reportedChainCAIP2 from an arbitrary ContractRegistered entry in the same batch.
  // All entries in a batch share the same batchId; we pick the first one found.
  const contractEntries = await db.sql
    .select({ caip2ChainId: fraudulentContract.caip2ChainId })
    .from(fraudulentContract)
    .where(eq(fraudulentContract.batchId, batchIdStr))
    .limit(1);
  const reportedChainCAIP2 = contractEntries[0]?.caip2ChainId ?? null;

  await db
    .insert(fraudulentContractBatch)
    .values({
      id: batchIdStr,
      operatorId,
      operator: operatorAddress,
      reportedChainCAIP2,
      contractCount: Number(contractCount),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  // Both counters in one read-modify-write — see the ContractRegistered handler for why the
  // per-entry total is accumulated here rather than 800 times.
  await updateGlobalStats(
    db,
    { totalContractBatches: 1, totalFraudulentContracts: Number(contractCount) },
    event.block.timestamp
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN INBOX
// ═══════════════════════════════════════════════════════════════════════════

// WalletRegistrationReceived — message received from spoke chain
ponder.on('CrossChainInbox:WalletRegistrationReceived', async ({ event, context }) => {
  const { origin, identifier, messageId } = event.args;
  const { db } = context;

  const walletAddress = identifierToAddress(identifier);
  const sourceCAIP2 = hyperlaneDomainToCAIP2(origin);
  const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      // `origin` is a Hyperlane DOMAIN, not a chain ID. They coincide for every chain
      // @swr/chains knows; for one it does not, the domain is still a usable correlation key,
      // so it is kept — and the flag says which numbering space the value is in.
      sourceChainId: sourceNumeric ?? origin,
      sourceChainIsDomain: sourceNumeric === null,
      sourceChainCAIP2: sourceCAIP2,
      targetChainId: HUB_CHAIN_ID,
      wallet: walletAddress,
      hubTxHash: event.transaction.hash,
      status: 'received',
      receivedAt: event.block.timestamp,
    })
    // Never downgrade. The registry handlers run BEFORE this one (the inbox emits after it
    // has delegated), so by the time we get here the row is normally already 'registered'.
    // A flat `status: 'received'` would overwrite that and the message would look stuck.
    .onConflictDoUpdate((row) => ({
      status: row.status === 'registered' ? 'registered' : 'received',
      receivedAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
      // walletAddress is null for non-EVM identifiers — never clobber a known address.
      wallet: walletAddress ?? row.wallet,
      // The registry handler creates the row first but only has the bytes32 chain hash — an
      // unknown spoke resolves to 0 there. This handler has the Hyperlane origin domain, a
      // strictly better fallback; repair a zero rather than leaving it wrong forever.
      sourceChainId: row.sourceChainId === 0 ? (sourceNumeric ?? origin) : row.sourceChainId,
      sourceChainIsDomain:
        row.sourceChainId === 0 ? sourceNumeric === null : row.sourceChainIsDomain,
      // Same repair, on the unambiguous column: the registry handler resolves the bytes32
      // chain hash, this one resolves the Hyperlane domain, and either may be the one that
      // knows the chain. Fill a null; never overwrite a value that resolved.
      sourceChainCAIP2: row.sourceChainCAIP2 ?? sourceCAIP2,
    }));
});

// TransactionBatchReceived — message received from spoke chain
ponder.on('CrossChainInbox:TransactionBatchReceived', async ({ event, context }) => {
  const { origin, messageId } = event.args;
  const { db } = context;

  const sourceCAIP2 = hyperlaneDomainToCAIP2(origin);
  const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

  // Note: dataHash is the committed keccak hash, NOT a batchId.
  // The actual batchId is only known when TransactionBatchRegistered fires on the hub.
  // Leave batchId null for cross-chain entries to avoid conflating the two.
  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      // `origin` is a Hyperlane DOMAIN, not a chain ID. They coincide for every chain
      // @swr/chains knows; for one it does not, the domain is still a usable correlation key,
      // so it is kept — and the flag says which numbering space the value is in.
      sourceChainId: sourceNumeric ?? origin,
      sourceChainIsDomain: sourceNumeric === null,
      sourceChainCAIP2: sourceCAIP2,
      targetChainId: HUB_CHAIN_ID,
      hubTxHash: event.transaction.hash,
      status: 'received',
      receivedAt: event.block.timestamp,
    })
    // Never downgrade — see the wallet handler above.
    .onConflictDoUpdate((row) => ({
      status: row.status === 'registered' ? 'registered' : 'received',
      receivedAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
      // Repair a zero sourceChainId left by the registry handler — see the wallet handler.
      sourceChainId: row.sourceChainId === 0 ? (sourceNumeric ?? origin) : row.sourceChainId,
      sourceChainIsDomain:
        row.sourceChainId === 0 ? sourceNumeric === null : row.sourceChainIsDomain,
      sourceChainCAIP2: row.sourceChainCAIP2 ?? sourceCAIP2,
    }));
});

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND TOKENS
// ═══════════════════════════════════════════════════════════════════════════

// WalletSoulboundMinted event
ponder.on('WalletSoulbound:WalletSoulboundMinted', async ({ event, context }) => {
  const { tokenId, wallet, minter } = event.args;
  const { db } = context;

  await db
    .insert(walletSoulboundToken)
    .values({
      id: tokenId.toString(),
      wallet: wallet.toLowerCase() as Address,
      minter: minter.toLowerCase() as Address,
      mintedAt: event.block.timestamp,
      mintedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  await updateGlobalStats(db, { walletSoulbounds: 1 }, event.block.timestamp);
});

// SupportSoulboundMinted event
ponder.on('SupportSoulbound:SupportSoulboundMinted', async ({ event, context }) => {
  const { tokenId, supporter, amount } = event.args;
  const { db } = context;

  await db
    .insert(supportSoulboundToken)
    .values({
      id: tokenId.toString(),
      supporter: supporter.toLowerCase() as Address,
      amount,
      mintedAt: event.block.timestamp,
      mintedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  await updateGlobalStats(
    db,
    {
      supportSoulbounds: 1,
      supportDonations: amount,
    },
    event.block.timestamp
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// OPERATOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// OperatorApproved event
ponder.on('OperatorRegistry:OperatorApproved', async ({ event, context }) => {
  const { operator: operatorAddress, capabilities, identifier, approvedAt } = event.args;
  const { db } = context;

  const capabilitiesNum = Number(capabilities);
  const operatorId = operatorAddress.toLowerCase() as Address;

  // Check if operator already exists to avoid double-counting stats
  const existing = await db.find(operator, { id: operatorId });

  // Compute stat deltas based on prior state
  let totalOperatorsDelta = 0;
  let activeOperatorsDelta = 0;

  if (!existing) {
    // New operator: increment both counters
    totalOperatorsDelta = 1;
    activeOperatorsDelta = 1;
  } else if (!existing.approved) {
    // Previously revoked operator being re-approved: only increment active
    activeOperatorsDelta = 1;
  }

  await db
    .insert(operator)
    .values({
      id: operatorId,
      identifier,
      capabilities: capabilitiesNum,
      approved: true,
      approvedAt: BigInt(approvedAt),
      revokedAt: null,
      approvalTxHash: event.transaction.hash,
      canSubmitWallet: (capabilitiesNum & 0x01) !== 0,
      canSubmitTransaction: (capabilitiesNum & 0x02) !== 0,
      canSubmitContract: (capabilitiesNum & 0x04) !== 0,
    })
    .onConflictDoUpdate({
      identifier,
      capabilities: capabilitiesNum,
      approved: true,
      approvedAt: BigInt(approvedAt),
      revokedAt: null,
      approvalTxHash: event.transaction.hash,
      canSubmitWallet: (capabilitiesNum & 0x01) !== 0,
      canSubmitTransaction: (capabilitiesNum & 0x02) !== 0,
      canSubmitContract: (capabilitiesNum & 0x04) !== 0,
    });

  if (totalOperatorsDelta !== 0 || activeOperatorsDelta !== 0) {
    await updateGlobalStats(
      db,
      {
        totalOperators: totalOperatorsDelta,
        activeOperators: activeOperatorsDelta,
      },
      event.block.timestamp
    );
  }
});

// OperatorRevoked event
ponder.on('OperatorRegistry:OperatorRevoked', async ({ event, context }) => {
  const { operator: operatorAddress, revokedAt } = event.args;
  const { db } = context;

  const operatorId = operatorAddress.toLowerCase() as Address;

  // Check if operator was actually approved before decrementing stats
  const existing = await db.find(operator, { id: operatorId });
  if (!existing) return;

  const wasApproved = existing.approved ?? false;

  await db.update(operator, { id: operatorId }).set({
    approved: false,
    revokedAt: BigInt(revokedAt),
  });

  if (wasApproved) {
    await updateGlobalStats(
      db,
      {
        activeOperators: -1,
      },
      event.block.timestamp
    );
  }
});

// OperatorCapabilitiesUpdated event
ponder.on('OperatorRegistry:OperatorCapabilitiesUpdated', async ({ event, context }) => {
  const { operator: operatorAddress, oldCapabilities, newCapabilities } = event.args;
  const { db } = context;

  const newCapsNum = Number(newCapabilities);
  const operatorId = operatorAddress.toLowerCase() as Address;

  // db.update throws RecordNotFoundError and halts indexing if the approval
  // predates the configured start block.
  const existing = await db.find(operator, { id: operatorId });
  if (!existing) return;

  await db.update(operator, { id: operatorId }).set({
    capabilities: newCapsNum,
    canSubmitWallet: (newCapsNum & 0x01) !== 0,
    canSubmitTransaction: (newCapsNum & 0x02) !== 0,
    canSubmitContract: (newCapsNum & 0x04) !== 0,
  });

  await db
    .insert(operatorCapabilityChange)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      operator: operatorAddress.toLowerCase() as Address,
      oldCapabilities: Number(oldCapabilities),
      newCapabilities: newCapsNum,
      changedAt: event.block.timestamp,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();
});

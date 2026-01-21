import { ponder } from 'ponder:registry';
import {
  stolenWallet,
  walletAcknowledgement,
  transactionBatch,
  transactionInBatch,
  transactionBatchAcknowledgement,
  crossChainMessage,
  walletSoulboundToken,
  supportSoulboundToken,
  registryStats,
} from 'ponder:schema';
import {
  toCAIP10,
  resolveChainIdHash,
  caip2ToNumericChainId,
  hyperlaneDomainToCAIP2,
  anvilHub,
} from '@swr/chains';
import { keccak256, encodePacked, type Address, type Hex } from 'viem';

// Hub chain configuration - determined by environment
// TODO: Make this configurable via PONDER_ENV environment variable
const HUB_CHAIN_ID = anvilHub.chainId;

// Helper to lowercase addresses while preserving type
const toLowerAddress = (addr: Address): Address => addr.toLowerCase() as Address;

/**
 * Compute deterministic batch acknowledgement ID.
 * Matches on-chain batchId computation: keccak256(abi.encodePacked(merkleRoot, reporter, reportedChainId))
 */
function computeBatchAcknowledgementId(
  merkleRoot: Hex,
  reporter: Address,
  reportedChainId: Hex
): Hex {
  return keccak256(
    encodePacked(['bytes32', 'address', 'bytes32'], [merkleRoot, reporter, reportedChainId])
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Update global stats
// ═══════════════════════════════════════════════════════════════════════════

type StatsDelta = {
  walletRegistrations?: number;
  transactionBatches?: number;
  transactionsReported?: number;
  sponsored?: number;
  crossChain?: number;
  walletSoulbounds?: number;
  supportSoulbounds?: number;
  supportDonations?: bigint;
};

async function updateGlobalStats(db: any, delta: StatsDelta, timestamp: bigint) {
  const id = 'global';
  const existing = await db.find(registryStats, { id });

  if (existing) {
    // Compute new totals first
    const newTotalWalletRegistrations =
      existing.totalWalletRegistrations + (delta.walletRegistrations ?? 0);
    const newSponsored = existing.sponsoredRegistrations + (delta.sponsored ?? 0);
    const newCrossChain = existing.crossChainRegistrations + (delta.crossChain ?? 0);
    // Direct = total wallets - sponsored (cross-chain is a subset of sponsored)
    const newDirectRegistrations = newTotalWalletRegistrations - newSponsored;

    await db.update(registryStats, { id }).set({
      totalWalletRegistrations: newTotalWalletRegistrations,
      totalTransactionBatches: existing.totalTransactionBatches + (delta.transactionBatches ?? 0),
      totalTransactionsReported:
        existing.totalTransactionsReported + (delta.transactionsReported ?? 0),
      sponsoredRegistrations: newSponsored,
      directRegistrations: newDirectRegistrations,
      crossChainRegistrations: newCrossChain,
      walletSoulboundsMinted: existing.walletSoulboundsMinted + (delta.walletSoulbounds ?? 0),
      supportSoulboundsMinted: existing.supportSoulboundsMinted + (delta.supportSoulbounds ?? 0),
      totalSupportDonations: existing.totalSupportDonations + (delta.supportDonations ?? 0n),
      lastUpdated: timestamp,
    });
  } else {
    // First entry - compute initial values
    const totalWallets = delta.walletRegistrations ?? 0;
    const sponsored = delta.sponsored ?? 0;
    // Direct = total - sponsored
    const directRegistrations = totalWallets - sponsored;

    await db.insert(registryStats).values({
      id,
      totalWalletRegistrations: totalWallets,
      totalTransactionBatches: delta.transactionBatches ?? 0,
      totalTransactionsReported: delta.transactionsReported ?? 0,
      sponsoredRegistrations: sponsored,
      directRegistrations,
      crossChainRegistrations: delta.crossChain ?? 0,
      walletSoulboundsMinted: delta.walletSoulbounds ?? 0,
      supportSoulboundsMinted: delta.supportSoulbounds ?? 0,
      totalSupportDonations: delta.supportDonations ?? 0n,
      lastUpdated: timestamp,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN WALLET REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// WalletAcknowledged event
ponder.on('StolenWalletRegistry:WalletAcknowledged', async ({ event, context }) => {
  const { owner, forwarder, isSponsored } = event.args;
  const { db } = context;

  // Calculate grace period timing (mirror contract logic)
  // START_TIME_BLOCKS = 5, DEADLINE_BLOCKS = 20 (from contract)
  const gracePeriodStart = event.block.number + 5n;
  const gracePeriodEnd = gracePeriodStart + 20n;

  await db
    .insert(walletAcknowledgement)
    .values({
      id: owner.toLowerCase() as Address,
      forwarder: forwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    })
    .onConflictDoUpdate({
      forwarder: forwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    });
});

// WalletRegistered event
ponder.on('StolenWalletRegistry:WalletRegistered', async ({ event, context }) => {
  const { owner, isSponsored } = event.args;
  const { db } = context;

  const walletAddress = owner.toLowerCase() as Address;

  // Create stolen wallet record
  await db
    .insert(stolenWallet)
    .values({
      id: walletAddress,
      caip10: toCAIP10(walletAddress, HUB_CHAIN_ID),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
    })
    .onConflictDoNothing();

  // Mark pending acknowledgement as registered
  const pending = await db.find(walletAcknowledgement, { id: walletAddress });
  if (pending) {
    await db.update(walletAcknowledgement, { id: walletAddress }).set({ status: 'registered' });
  }

  // Update stats
  await updateGlobalStats(
    db,
    {
      walletRegistrations: 1,
      sponsored: isSponsored ? 1 : 0,
    },
    event.block.timestamp
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN TRANSACTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// TransactionBatchAcknowledged event
// Compute the same deterministic batchId used on-chain for consistent lookups
ponder.on('StolenTransactionRegistry:TransactionBatchAcknowledged', async ({ event, context }) => {
  const { merkleRoot, reporter, forwarder, reportedChainId, transactionCount, isSponsored } =
    event.args;
  const { db } = context;

  const gracePeriodStart = event.block.number + 5n;
  const gracePeriodEnd = gracePeriodStart + 20n;

  // Compute deterministic batch ID matching on-chain computation
  const batchId = computeBatchAcknowledgementId(merkleRoot, reporter, reportedChainId);

  await db
    .insert(transactionBatchAcknowledgement)
    .values({
      id: batchId,
      merkleRoot,
      reporter: reporter.toLowerCase() as Address,
      forwarder: forwarder.toLowerCase() as Address,
      reportedChainIdHash: reportedChainId,
      transactionCount: Number(transactionCount),
      isSponsored,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    })
    .onConflictDoUpdate({
      forwarder: forwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      status: 'pending',
    });
});

// TransactionBatchRegistered event - CRITICAL: extract tx hashes from event
ponder.on('StolenTransactionRegistry:TransactionBatchRegistered', async ({ event, context }) => {
  const {
    batchId,
    merkleRoot,
    reporter,
    reportedChainId,
    transactionCount,
    isSponsored,
    transactionHashes,
    chainIds,
  } = event.args;
  const { db } = context;

  // Resolve the reported chain ID
  const reportedChainCAIP2 = resolveChainIdHash(reportedChainId);

  // Create batch record - use onConflictDoNothing for idempotency (batch may be reported multiple times)
  await db
    .insert(transactionBatch)
    .values({
      id: batchId,
      merkleRoot,
      reporter: reporter.toLowerCase() as Address,
      reportedChainIdHash: reportedChainId,
      reportedChainCAIP2,
      transactionCount: Number(transactionCount),
      isSponsored,
      isOperatorVerified: false,
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  // Index individual transactions from event data
  for (let i = 0; i < transactionHashes.length; i++) {
    const txHash = transactionHashes[i];
    const chainIdHash = chainIds[i];

    // Skip if array values are missing (shouldn't happen with valid events)
    if (!txHash || !chainIdHash) continue;

    // Resolve chain ID hash to CAIP-2
    const caip2ChainId = resolveChainIdHash(chainIdHash);
    const numericChainId = caip2ChainId ? caip2ToNumericChainId(caip2ChainId) : null;

    // Composite key: txHash + resolved CAIP-2
    const compositeId = `${txHash}-${caip2ChainId ?? chainIdHash}`;

    await db
      .insert(transactionInBatch)
      .values({
        id: compositeId,
        txHash,
        chainIdHash,
        caip2ChainId: caip2ChainId ?? `unknown:${chainIdHash}`,
        numericChainId,
        batchId,
        reporter: reporter.toLowerCase() as Address,
        reportedAt: event.block.timestamp,
      })
      .onConflictDoNothing();
  }

  // Update acknowledgement status - lookup by the deterministic batchId
  const pending = await db.find(transactionBatchAcknowledgement, {
    id: batchId,
  });
  if (pending) {
    await db.update(transactionBatchAcknowledgement, { id: batchId }).set({ status: 'registered' });
  }

  // Update stats
  await updateGlobalStats(
    db,
    {
      transactionBatches: 1,
      transactionsReported: Number(transactionCount),
    },
    event.block.timestamp
  );
});

// OperatorVerified event
ponder.on('StolenTransactionRegistry:OperatorVerified', async ({ event, context }) => {
  const { batchId, operator } = event.args;
  const { db } = context;

  await db.update(transactionBatch, { id: batchId }).set({
    isOperatorVerified: true,
    verifyingOperator: operator.toLowerCase() as Address,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY HUB (Cross-Chain Registrations)
// ═══════════════════════════════════════════════════════════════════════════

// CrossChainRegistration event (wallet from spoke)
ponder.on('RegistryHub:CrossChainRegistration', async ({ event, context }) => {
  const { wallet, sourceChainId, messageId } = event.args;
  const { db } = context;

  const walletAddress = wallet.toLowerCase() as Address;
  const sourceCAIP2 = hyperlaneDomainToCAIP2(sourceChainId);

  // Create/update stolen wallet with cross-chain metadata
  await db
    .insert(stolenWallet)
    .values({
      id: walletAddress,
      caip10: toCAIP10(walletAddress, HUB_CHAIN_ID),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored: true, // Cross-chain is always sponsored
      sourceChainId,
      sourceChainCAIP2: sourceCAIP2,
      messageId,
    })
    .onConflictDoUpdate({
      sourceChainId,
      sourceChainCAIP2: sourceCAIP2,
      messageId,
    });

  // Update cross-chain message status
  const existingMsg = await db.find(crossChainMessage, { id: messageId });
  if (existingMsg) {
    await db.update(crossChainMessage, { id: messageId }).set({
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
  }

  // Update stats
  await updateGlobalStats(
    db,
    {
      walletRegistrations: 1,
      crossChain: 1,
      sponsored: 1,
    },
    event.block.timestamp
  );
});

// CrossChainBatchRegistration event (transaction batch from spoke)
// Note: This event does NOT include batchId - it has reporter, sourceChainId (bytes32), reportedChainId (bytes32), messageId
// The actual batch record is created by TransactionBatchRegistered event from StolenTransactionRegistry
ponder.on('RegistryHub:CrossChainBatchRegistration', async ({ event, context }) => {
  const { reporter, sourceChainId, reportedChainId, messageId } = event.args;
  const { db } = context;

  // Update cross-chain message status
  // Note: We don't have batchId here, so we can't link directly to the batch
  // The batch will be created when StolenTransactionRegistry emits TransactionBatchRegistered
  const existingMsg = await db.find(crossChainMessage, { id: messageId });
  if (existingMsg) {
    await db.update(crossChainMessage, { id: messageId }).set({
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
  } else {
    // Create a new cross-chain message record if one doesn't exist
    // This can happen if the inbox event wasn't indexed (late message or indexer started after inbox event)
    console.warn(
      `[CrossChainBatchRegistration] Creating message record for ${messageId} without prior inbox event. ` +
        `This may indicate the indexer started after the TransactionBatchReceived event was emitted.`
    );
    await db.insert(crossChainMessage).values({
      id: messageId,
      sourceChainId: 0, // sourceChainId is bytes32 here, we can't convert directly
      targetChainId: HUB_CHAIN_ID,
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN INBOX
// ═══════════════════════════════════════════════════════════════════════════

// RegistrationReceived event (first event when cross-chain message arrives)
ponder.on('CrossChainInbox:RegistrationReceived', async ({ event, context }) => {
  const { sourceChain, wallet, messageId } = event.args;
  const { db } = context;

  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      sourceChainId: sourceChain,
      targetChainId: HUB_CHAIN_ID,
      wallet: wallet.toLowerCase() as Address,
      status: 'received',
      receivedAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    })
    .onConflictDoUpdate({
      status: 'received',
      receivedAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
});

// TransactionBatchReceived event
ponder.on('CrossChainInbox:TransactionBatchReceived', async ({ event, context }) => {
  const { sourceChain, reporter, merkleRoot, messageId } = event.args;
  const { db } = context;

  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      sourceChainId: sourceChain,
      targetChainId: HUB_CHAIN_ID,
      status: 'received',
      receivedAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    })
    .onConflictDoUpdate({
      status: 'received',
      receivedAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOULBOUND TOKENS
// ═══════════════════════════════════════════════════════════════════════════

// WalletSoulboundMinted event
ponder.on('WalletSoulbound:WalletSoulboundMinted', async ({ event, context }) => {
  const { tokenId, wallet, minter } = event.args;
  const { db } = context;

  // Use onConflictDoNothing for idempotency - same event may be replayed during reorg
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

  // Use onConflictDoNothing for idempotency - same event may be replayed during reorg
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

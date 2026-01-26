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
  invalidatedEntry,
} from 'ponder:schema';
import {
  toCAIP10,
  resolveChainIdHash,
  caip2ToNumericChainId,
  hyperlaneDomainToCAIP2,
  anvilHub,
  baseSepolia,
  base,
  type Environment,
} from '@swr/chains';
import { keccak256, encodePacked, encodeAbiParameters, concat, type Address, type Hex } from 'viem';

// Hub chain configuration - determined by environment
const PONDER_ENV = (process.env.PONDER_ENV ?? 'development') as Environment;

const HUB_CHAIN_IDS: Record<Environment, number> = {
  development: anvilHub.chainId,
  staging: baseSepolia.chainId,
  production: base.chainId,
};

const HUB_CHAIN_ID = HUB_CHAIN_IDS[PONDER_ENV];

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

async function indexTransactions(
  db: any,
  transactionHashes: readonly Hex[],
  chainIds: readonly Hex[],
  batchId: Hex,
  reporter: Address,
  reportedAt: bigint
) {
  for (let i = 0; i < transactionHashes.length; i++) {
    const txHash = transactionHashes[i];
    const chainIdHash = chainIds[i];

    // Skip if array values are missing
    if (!txHash || !chainIdHash) continue;

    // Resolve chain ID hash to CAIP-2, normalize fallback for consistency
    const resolved = resolveChainIdHash(chainIdHash);
    const resolvedCaip2 = resolved ?? `unknown:${chainIdHash}`;
    const numericChainId = resolved ? caip2ToNumericChainId(resolved) : null;

    // Composite key: txHash + resolved CAIP-2 (must match caip2ChainId column)
    const compositeId = `${txHash}-${resolvedCaip2}`;

    await db
      .insert(transactionInBatch)
      .values({
        id: compositeId,
        txHash,
        chainIdHash,
        caip2ChainId: resolvedCaip2,
        numericChainId,
        batchId,
        reporter,
        reportedAt,
      })
      .onConflictDoNothing();
  }
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
  // Operator registry
  totalOperators?: number;
  activeOperators?: number;
  // Operator batch submissions
  totalWalletBatches?: number;
  totalOperatorTransactionBatches?: number;
  totalContractBatches?: number;
  totalFraudulentContracts?: number;
  invalidatedContractBatches?: number;
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
      totalOperators: existing.totalOperators + (delta.totalOperators ?? 0),
      activeOperators: existing.activeOperators + (delta.activeOperators ?? 0),
      totalWalletBatches: existing.totalWalletBatches + (delta.totalWalletBatches ?? 0),
      totalOperatorTransactionBatches:
        existing.totalOperatorTransactionBatches + (delta.totalOperatorTransactionBatches ?? 0),
      totalContractBatches: existing.totalContractBatches + (delta.totalContractBatches ?? 0),
      totalFraudulentContracts:
        existing.totalFraudulentContracts + (delta.totalFraudulentContracts ?? 0),
      invalidatedContractBatches:
        existing.invalidatedContractBatches + (delta.invalidatedContractBatches ?? 0),
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
      totalOperators: delta.totalOperators ?? 0,
      activeOperators: delta.activeOperators ?? 0,
      totalWalletBatches: delta.totalWalletBatches ?? 0,
      totalOperatorTransactionBatches: delta.totalOperatorTransactionBatches ?? 0,
      totalContractBatches: delta.totalContractBatches ?? 0,
      totalFraudulentContracts: delta.totalFraudulentContracts ?? 0,
      invalidatedContractBatches: delta.invalidatedContractBatches ?? 0,
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

// WalletBatchRegistered event - operator batch submission
ponder.on('StolenWalletRegistry:WalletBatchRegistered', async ({ event, context }) => {
  const {
    batchId,
    merkleRoot,
    operator: operatorAddress,
    reportedChainId,
    walletCount,
    walletAddresses,
    chainIds,
  } = event.args;
  const { db } = context;

  // Resolve the reported chain ID
  const reportedChainCAIP2 = resolveChainIdHash(reportedChainId);

  // Insert batch record
  await db
    .insert(walletBatch)
    .values({
      id: batchId,
      merkleRoot,
      operator: operatorAddress.toLowerCase() as Address,
      reportedChainIdHash: reportedChainId,
      reportedChainCAIP2,
      walletCount: Number(walletCount),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  // Insert individual wallets from event data
  for (let i = 0; i < walletAddresses.length; i++) {
    const walletAddr = walletAddresses[i];
    const chainIdHash = chainIds[i];

    // Skip if array values are missing
    if (!walletAddr || !chainIdHash) continue;

    // Resolve chain ID hash to CAIP-2
    const caip2ChainId = resolveChainIdHash(chainIdHash);
    const numericChainId = caip2ChainId ? caip2ToNumericChainId(caip2ChainId) : null;

    const walletAddress = walletAddr.toLowerCase() as Address;

    // Create stolen wallet record with batch reference
    await db
      .insert(stolenWallet)
      .values({
        id: walletAddress,
        caip10: numericChainId
          ? toCAIP10(walletAddress, numericChainId)
          : `unknown:${chainIdHash}:${walletAddress}`,
        registeredAt: event.block.timestamp,
        registeredAtBlock: event.block.number,
        transactionHash: event.transaction.hash,
        isSponsored: false, // Operator batches are not "sponsored" in the relay sense
        batchId,
        operator: operatorAddress.toLowerCase() as Address,
      })
      .onConflictDoNothing();
  }

  // Update stats
  await updateGlobalStats(
    db,
    {
      walletRegistrations: Number(walletCount),
      totalWalletBatches: 1,
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

  await indexTransactions(
    db,
    transactionHashes,
    chainIds,
    batchId,
    reporter.toLowerCase() as Address,
    event.block.timestamp
  );

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

  const existing = await db.find(transactionBatch, { id: batchId });
  if (!existing) {
    console.warn(`[OperatorVerified] Missing transaction batch ${batchId}. Skipping update.`);
    return;
  }

  await db.update(transactionBatch, { id: batchId }).set({
    isOperatorVerified: true,
    verifyingOperator: operator.toLowerCase() as Address,
  });
});

// TransactionBatchRegisteredByOperator event - operator direct batch submission
ponder.on(
  'StolenTransactionRegistry:TransactionBatchRegisteredByOperator',
  async ({ event, context }) => {
    const {
      batchId,
      merkleRoot,
      operator: operatorAddress,
      reportedChainId,
      transactionCount,
      transactionHashes,
      chainIds,
    } = event.args;
    const { db } = context;

    // Resolve the reported chain ID
    const reportedChainCAIP2 = resolveChainIdHash(reportedChainId);

    // Create batch record - operator batches are automatically operator-verified
    await db
      .insert(transactionBatch)
      .values({
        id: batchId,
        merkleRoot,
        reporter: operatorAddress.toLowerCase() as Address,
        reportedChainIdHash: reportedChainId,
        reportedChainCAIP2,
        transactionCount: Number(transactionCount),
        isSponsored: false, // Operator batches skip the sponsor flow
        isOperatorVerified: true, // Operator submissions are auto-verified
        verifyingOperator: operatorAddress.toLowerCase() as Address,
        registeredAt: event.block.timestamp,
        registeredAtBlock: event.block.number,
        transactionHash: event.transaction.hash,
      })
      .onConflictDoNothing();

    await indexTransactions(
      db,
      transactionHashes,
      chainIds,
      batchId,
      operatorAddress.toLowerCase() as Address,
      event.block.timestamp
    );

    // Update stats - operator batches count toward both operator-specific AND global batch counts
    await updateGlobalStats(
      db,
      {
        transactionBatches: 1, // Counts toward totalTransactionBatches
        totalOperatorTransactionBatches: 1, // Operator-specific count
        transactionsReported: Number(transactionCount),
      },
      event.block.timestamp
    );
  }
);

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
    // Try to resolve the bytes32 sourceChainId to a numeric chain ID
    const sourceCAIP2 = resolveChainIdHash(sourceChainId);
    const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

    console.warn(
      `[CrossChainBatchRegistration] Creating message record for ${messageId} without prior inbox event. ` +
        `This may indicate the indexer started after the TransactionBatchReceived event was emitted.`
    );
    await db.insert(crossChainMessage).values({
      id: messageId,
      sourceChainId: sourceNumeric ?? 0, // fallback to 0 only if unresolved
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
  // If already approved, no stats change needed

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

  // Update stats with computed deltas
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
  const wasApproved = existing?.approved ?? false;

  await db.update(operator, { id: operatorId }).set({
    approved: false,
    revokedAt: BigInt(revokedAt),
  });

  // Only decrement active operators if they were actually approved
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

  // Update operator capabilities
  await db.update(operator, { id: operatorAddress.toLowerCase() as Address }).set({
    capabilities: newCapsNum,
    canSubmitWallet: (newCapsNum & 0x01) !== 0,
    canSubmitTransaction: (newCapsNum & 0x02) !== 0,
    canSubmitContract: (newCapsNum & 0x04) !== 0,
  });

  // Record change history
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

// ═══════════════════════════════════════════════════════════════════════════
// FRAUDULENT CONTRACT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// ContractBatchRegistered event
ponder.on('FraudulentContractRegistry:ContractBatchRegistered', async ({ event, context }) => {
  const {
    batchId,
    merkleRoot,
    operator: operatorAddress,
    reportedChainId,
    contractCount,
    contractAddresses,
    chainIds,
  } = event.args;
  const { db } = context;

  // Resolve the reported chain ID
  const reportedChainCAIP2 = resolveChainIdHash(reportedChainId);

  // Insert batch record
  await db
    .insert(fraudulentContractBatch)
    .values({
      id: batchId,
      merkleRoot,
      operator: operatorAddress.toLowerCase() as Address,
      reportedChainIdHash: reportedChainId,
      reportedChainCAIP2,
      contractCount: Number(contractCount),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      invalidated: false,
      invalidatedAt: null,
    })
    .onConflictDoNothing();

  // Insert individual contracts
  for (let i = 0; i < contractAddresses.length; i++) {
    const contractAddr = contractAddresses[i];
    const chainIdHash = chainIds[i];

    // Skip if array values are missing
    if (!contractAddr || !chainIdHash) continue;

    // Resolve chain ID hash to CAIP-2
    const caip2ChainId = resolveChainIdHash(chainIdHash);
    const numericChainId = caip2ChainId ? caip2ToNumericChainId(caip2ChainId) : null;

    // Composite key: contractAddress-chainIdHash
    const compositeId = `${contractAddr.toLowerCase()}-${chainIdHash}`;

    // Compute entryHash for linking with invalidation events
    // Matches contract's MerkleRootComputation.hashLeaf (OpenZeppelin v1.0.8+ standard):
    // keccak256(abi.encodePacked(keccak256(abi.encode(address, bytes32))))
    const innerHash = keccak256(
      encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [contractAddr, chainIdHash])
    );
    const entryHash = keccak256(innerHash);

    await db
      .insert(fraudulentContract)
      .values({
        id: compositeId,
        entryHash,
        contractAddress: contractAddr.toLowerCase() as Address,
        chainIdHash,
        caip2ChainId: caip2ChainId ?? `unknown:${chainIdHash}`,
        numericChainId,
        batchId,
        operator: operatorAddress.toLowerCase() as Address,
        reportedAt: event.block.timestamp,
      })
      .onConflictDoNothing();
  }

  // Update stats
  await updateGlobalStats(
    db,
    {
      totalContractBatches: 1,
      totalFraudulentContracts: Number(contractCount),
    },
    event.block.timestamp
  );
});

// BatchInvalidated event
ponder.on('FraudulentContractRegistry:BatchInvalidated', async ({ event, context }) => {
  const { batchId } = event.args;
  const { db } = context;

  await db.update(fraudulentContractBatch, { id: batchId }).set({
    invalidated: true,
    invalidatedAt: event.block.timestamp,
  });

  // Update stats
  await updateGlobalStats(
    db,
    {
      invalidatedContractBatches: 1,
    },
    event.block.timestamp
  );
});

// EntryInvalidated event
// Note: fraudulentContract.entryHash can be used to join with this table
// to determine invalidation status. The invalidatedEntry table is the source of truth.
ponder.on('FraudulentContractRegistry:EntryInvalidated', async ({ event, context }) => {
  const { entryHash, invalidatedBy } = event.args;
  const { db } = context;

  await db
    .insert(invalidatedEntry)
    .values({
      id: entryHash,
      invalidatedAt: event.block.timestamp,
      invalidatedBy: invalidatedBy.toLowerCase() as Address,
      transactionHash: event.transaction.hash,
      reinstated: false,
      reinstatedAt: null,
    })
    .onConflictDoNothing();
});

// EntryReinstated event
ponder.on('FraudulentContractRegistry:EntryReinstated', async ({ event, context }) => {
  const { entryHash } = event.args;
  const { db } = context;

  await db.update(invalidatedEntry, { id: entryHash }).set({
    reinstated: true,
    reinstatedAt: event.block.timestamp,
  });
});

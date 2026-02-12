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
  toCAIP10,
  resolveChainIdHash,
  caip2ToNumericChainId,
  hyperlaneDomainToCAIP2,
  anvilHub,
  baseSepolia,
  base,
  type Environment,
} from '@swr/chains';
import { type Address, type Hex } from 'viem';

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
 * Extract EVM address from bytes32 identifier.
 * Addresses are stored as bytes32(uint256(uint160(address))).
 * The address is in the rightmost 20 bytes.
 */
function identifierToAddress(identifier: Hex): Address {
  // bytes32 = 66 chars (0x + 64 hex). Address = last 40 hex chars.
  const hex = identifier.slice(26); // skip 0x + 24 leading zero chars
  return `0x${hex}`.toLowerCase() as Address;
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
      lastUpdated: timestamp,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// WalletAcknowledged — tracks pending acknowledgements in grace period
ponder.on('WalletRegistry:WalletAcknowledged', async ({ event, context }) => {
  const { registeree, trustedForwarder, isSponsored } = event.args;
  const { db } = context;

  const gracePeriodStart = event.block.number + 5n;
  const gracePeriodEnd = gracePeriodStart + 20n;

  await db
    .insert(walletAcknowledgement)
    .values({
      id: registeree.toLowerCase() as Address,
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    })
    .onConflictDoUpdate({
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    });
});

// WalletRegistered — fires for individual, operator, AND cross-chain registrations
// NOTE: This event does NOT carry a batchId (zero per-entry gas impact).
// For operator batches, the BatchCreated handler fires in the same tx and shares transactionHash.
// Wallet batch detail queries join stolenWallet ↔ walletBatch on transactionHash.
ponder.on('WalletRegistry:WalletRegistered', async ({ event, context }) => {
  const { identifier, reportedChainId, incidentTimestamp, isSponsored } = event.args;
  const { db } = context;

  const walletAddress = identifierToAddress(identifier);
  const reportedChainCAIP2 = resolveChainIdHash(reportedChainId);

  await db
    .insert(stolenWallet)
    .values({
      id: walletAddress,
      caip10: toCAIP10(walletAddress, HUB_CHAIN_ID),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      isSponsored,
      reportedChainId,
      reportedChainCAIP2,
      incidentTimestamp: BigInt(incidentTimestamp),
    })
    .onConflictDoNothing();

  // Mark pending acknowledgement as registered
  const pending = await db.find(walletAcknowledgement, { id: walletAddress });
  if (pending) {
    await db.update(walletAcknowledgement, { id: walletAddress }).set({ status: 'registered' });
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

  const walletAddress = identifierToAddress(identifier);
  const sourceCAIP2 = resolveChainIdHash(sourceChainId);
  const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

  // Update the wallet record that WalletRegistered already inserted
  await db.update(stolenWallet, { id: walletAddress }).set({
    sourceChainId: sourceNumeric,
    sourceChainCAIP2: sourceCAIP2,
    bridgeId,
    messageId,
  });

  // Update cross-chain message tracking
  const existing = await db.find(crossChainMessage, { id: messageId });
  if (existing) {
    await db.update(crossChainMessage, { id: messageId }).set({
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
  }

  await updateGlobalStats(db, { crossChain: 1 }, event.block.timestamp);
});

// BatchCreated — operator wallet batch
// Fires AFTER all WalletRegistered events in the same tx.
// Use transactionHash to correlate wallets to this batch.
ponder.on('WalletRegistry:BatchCreated', async ({ event, context }) => {
  const { batchId, operatorId, walletCount } = event.args;
  const { db } = context;

  const batchIdStr = batchId.toString();
  const operatorAddress = toLowerAddress(event.transaction.from);

  // Insert batch record
  await db
    .insert(walletBatch)
    .values({
      id: batchIdStr,
      operatorId,
      operator: operatorAddress,
      walletCount: Number(walletCount),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  await updateGlobalStats(db, { totalWalletBatches: 1 }, event.block.timestamp);
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

// TransactionBatchAcknowledged
ponder.on('TransactionRegistry:TransactionBatchAcknowledged', async ({ event, context }) => {
  const { reporter, trustedForwarder, dataHash, isSponsored } = event.args;
  const { db } = context;

  const gracePeriodStart = event.block.number + 5n;
  const gracePeriodEnd = gracePeriodStart + 20n;

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
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    })
    .onConflictDoUpdate({
      dataHash,
      trustedForwarder: trustedForwarder.toLowerCase() as Address,
      isSponsored,
      acknowledgedAt: event.block.timestamp,
      acknowledgedAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
      gracePeriodStart,
      gracePeriodEnd,
      status: 'pending',
    });
});

// TransactionRegistered — fires per tx for individual, operator, AND cross-chain
// NOTE: This event does NOT carry a batchId (zero per-entry gas impact).
// Entries link to their parent batch via transactionHash — the batch summary event
// (TransactionBatchRegistered or TransactionBatchCreated) fires in the same tx.
// Batch detail queries join on transactionHash.
ponder.on('TransactionRegistry:TransactionRegistered', async ({ event, context }) => {
  const { identifier, reportedChainId, reporter, isSponsored } = event.args;
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

  await db
    .insert(transactionBatch)
    .values({
      id: batchId.toString(),
      dataHash,
      reporter: reporter.toLowerCase() as Address,
      transactionCount: Number(transactionCount),
      isSponsored,
      isOperator: false,
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  // Mark pending ack as registered
  const reporterAddr = reporter.toLowerCase() as Address;
  const pending = await db.find(transactionBatchAcknowledgement, { id: reporterAddr });
  if (pending) {
    await db.update(transactionBatchAcknowledgement, { id: reporterAddr }).set({
      status: 'registered',
    });
  }

  await updateGlobalStats(
    db,
    {
      transactionBatches: 1,
      transactionsReported: Number(transactionCount),
      sponsored: isSponsored ? 1 : 0,
    },
    event.block.timestamp
  );
});

// CrossChainTransactionRegistered — fires per tx alongside TransactionRegistered for cross-chain
ponder.on('TransactionRegistry:CrossChainTransactionRegistered', async ({ event, context }) => {
  const { identifier, sourceChainId, bridgeId, messageId } = event.args;
  const { db } = context;

  // Cross-chain message tracking
  const existing = await db.find(crossChainMessage, { id: messageId });
  if (existing) {
    await db.update(crossChainMessage, { id: messageId }).set({
      status: 'registered',
      registeredAt: event.block.timestamp,
      hubTxHash: event.transaction.hash,
    });
  }
});

// TransactionBatchCreated — operator batch summary
ponder.on('TransactionRegistry:TransactionBatchCreated', async ({ event, context }) => {
  const { batchId, operatorId, transactionCount } = event.args;
  const { db } = context;

  const batchIdStr = batchId.toString();
  const operatorAddress = toLowerAddress(event.transaction.from);

  await db
    .insert(transactionBatch)
    .values({
      id: batchIdStr,
      dataHash: ('0x' + '0'.repeat(64)) as Hex, // No dataHash for operator batches
      reporter: operatorAddress,
      transactionCount: Number(transactionCount),
      isSponsored: false,
      isOperator: true,
      operatorId,
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  await updateGlobalStats(
    db,
    {
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
  const { identifier, reportedChainId, operatorId, batchId } = event.args;
  const { db } = context;

  const contractAddress = identifierToAddress(identifier);
  const caip2ChainId =
    resolveChainIdHash(reportedChainId) ?? `unknown:${reportedChainId.slice(0, 10)}`;
  const numericChainId = caip2ToNumericChainId(caip2ChainId);

  await db
    .insert(fraudulentContract)
    .values({
      id: `${contractAddress}-${reportedChainId}`,
      contractAddress,
      chainIdHash: reportedChainId,
      caip2ChainId,
      numericChainId,
      batchId: batchId.toString(),
      operator: toLowerAddress(event.transaction.from),
      reportedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await updateGlobalStats(db, { totalFraudulentContracts: 1 }, event.block.timestamp);
});

// ContractBatchCreated — operator batch summary
ponder.on('ContractRegistry:ContractBatchCreated', async ({ event, context }) => {
  const { batchId, operatorId, contractCount } = event.args;
  const { db } = context;

  const batchIdStr = batchId.toString();
  const operatorAddress = toLowerAddress(event.transaction.from);

  await db
    .insert(fraudulentContractBatch)
    .values({
      id: batchIdStr,
      operatorId,
      operator: operatorAddress,
      contractCount: Number(contractCount),
      registeredAt: event.block.timestamp,
      registeredAtBlock: event.block.number,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();

  await updateGlobalStats(db, { totalContractBatches: 1 }, event.block.timestamp);
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
      sourceChainId: sourceNumeric ?? origin,
      targetChainId: HUB_CHAIN_ID,
      wallet: walletAddress,
      spokeTxHash: event.transaction.hash,
      status: 'received',
      receivedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      status: 'received',
      receivedAt: event.block.timestamp,
      spokeTxHash: event.transaction.hash,
    });
});

// TransactionBatchReceived — message received from spoke chain
ponder.on('CrossChainInbox:TransactionBatchReceived', async ({ event, context }) => {
  const { origin, reporter, dataHash, messageId } = event.args;
  const { db } = context;

  const sourceCAIP2 = hyperlaneDomainToCAIP2(origin);
  const sourceNumeric = sourceCAIP2 ? caip2ToNumericChainId(sourceCAIP2) : null;

  await db
    .insert(crossChainMessage)
    .values({
      id: messageId,
      sourceChainId: sourceNumeric ?? origin,
      targetChainId: HUB_CHAIN_ID,
      batchId: dataHash,
      spokeTxHash: event.transaction.hash,
      status: 'received',
      receivedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      status: 'received',
      receivedAt: event.block.timestamp,
      spokeTxHash: event.transaction.hash,
    });
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
  const wasApproved = existing?.approved ?? false;

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

  await db.update(operator, { id: operatorAddress.toLowerCase() as Address }).set({
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

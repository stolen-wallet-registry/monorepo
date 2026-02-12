# On-Chain Storage & Event Architecture

How the registry contracts store data, emit events, and link batches to entries. Replaces the former merkle proof system.

---

## Storage Architecture

All registries use **direct mapping storage** with CAIP-derived keys. No merkle trees -- entries are written directly to storage for O(1) on-chain lookups.

### Wallet Registry

```solidity
// Wildcard across all EVM chains
mapping(bytes32 => WalletEntry) private _wallets;

// Storage key derivation
key = keccak256(abi.encodePacked("eip155:_:", wallet))
```

The wildcard `_` means a wallet registered on any chain is marked as compromised across **all** EVM chains.

### Transaction Registry

```solidity
// Chain-specific (same tx hash on different chains = different entries)
mapping(bytes32 => TransactionEntry) private _transactions;

// Storage key derivation
key = keccak256(abi.encode(txHash, chainId))
```

### Contract Registry

```solidity
// Chain-specific
mapping(bytes32 => ContractEntry) private _contracts;

// Storage key derivation
key = keccak256(abi.encode(contractAddress, chainId))
```

---

## Entry Structs

### WalletEntry

```solidity
struct WalletEntry {
    bytes32 reportedChainId;    // CAIP-2 hash of chain where incident occurred
    bytes32 sourceChainId;      // CAIP-2 hash of chain where registration submitted
    bytes32 messageId;          // Cross-chain message ID (bytes32(0) for local)
    uint64  registeredAt;       // Block timestamp
    uint64  incidentTimestamp;   // Unix timestamp of incident (0 if unknown)
    uint8   bridgeId;           // 0 = local, 1 = Hyperlane
    bool    isSponsored;        // True if someone else paid gas
}
```

### TransactionEntry

```solidity
struct TransactionEntry {
    bytes32 reportedChainId;
    bytes32 sourceChainId;
    bytes32 messageId;
    address reporter;           // Who reported this tx
    uint64  registeredAt;
    uint8   bridgeId;
    bool    isSponsored;
}
```

### TransactionBatch

```solidity
struct TransactionBatch {
    bytes32 operatorId;         // bytes32(0) for individual/cross-chain
    bytes32 dataHash;           // Committed hash (bytes32(0) for operator)
    address reporter;           // address(0) for operator
    uint64  timestamp;
    uint32  transactionCount;   // Actual count (excludes skipped entries)
}
```

---

## Events

### Wallet Registry

| Event                        | When                             | Key fields                                               |
| ---------------------------- | -------------------------------- | -------------------------------------------------------- |
| `WalletAcknowledged`         | Phase 1 complete                 | `registeree`, `trustedForwarder`, `isSponsored`          |
| `WalletRegistered`           | Phase 2 / cross-chain / operator | `identifier` (bytes32), `reportedChainId`, `isSponsored` |
| `CrossChainWalletRegistered` | Cross-chain only                 | `identifier`, `sourceChainId`, `bridgeId`, `messageId`   |
| `BatchCreated`               | Operator batch                   | `batchId` (uint256), `operatorId`, `walletCount`         |

### Transaction Registry

| Event                             | When                           | Key fields                                                |
| --------------------------------- | ------------------------------ | --------------------------------------------------------- |
| `TransactionBatchAcknowledged`    | Phase 1 complete               | `reporter`, `trustedForwarder`, `dataHash`, `isSponsored` |
| `TransactionRegistered`           | Per-entry (all paths)          | `identifier` (txHash), `reportedChainId`, `reporter`      |
| `TransactionBatchRegistered`      | Individual / cross-chain batch | `batchId` (uint256), `reporter`, `dataHash`, `count`      |
| `CrossChainTransactionRegistered` | Cross-chain per-entry          | `identifier`, `sourceChainId`, `bridgeId`, `messageId`    |
| `TransactionBatchCreated`         | Operator batch                 | `batchId` (uint256), `operatorId`, `transactionCount`     |

### Contract Registry

| Event                  | When           | Key fields                                             |
| ---------------------- | -------------- | ------------------------------------------------------ |
| `ContractRegistered`   | Per-entry      | `identifier`, `reportedChainId`, `batchId`, `operator` |
| `ContractBatchCreated` | Operator batch | `batchId` (uint256), `operatorId`, `contractCount`     |

### Identifier Encoding

The `identifier` field in events = `bytes32(uint256(uint160(address)))`. To recover the address:

```solidity
address(uint160(uint256(identifier)))
```

---

## Event Ordering and Batch Linking

Per-entry events fire **before** the batch summary event, all in the same transaction:

```text
tx 0xabc...
  ├── WalletRegistered(identifier_1, ...)     ← no batchId
  ├── WalletRegistered(identifier_2, ...)     ← no batchId
  ├── WalletRegistered(identifier_3, ...)     ← no batchId
  └── BatchCreated(batchId, operatorId, 3)    ← has batchId
                                                 ↑ same transactionHash
```

**Gas optimization:** Per-entry events do NOT carry a `batchId` field (except `ContractRegistered` which does). The indexer joins entries to their parent batch using `transactionHash` -- all events in the same transaction share it.

**Exception:** `ContractRegistered` includes `batchId` on per-entry events because contract registrations are operator-only (no individual path).

---

## Batch ID Assignment

Batch IDs are `uint256` (not uint32 or bytes32). Each registry maintains its own batch counter:

- `WalletRegistry._batchIdCounter`
- `TransactionRegistry._batchIdCounter`
- `ContractRegistry._batchIdCounter`

The `walletCount`/`transactionCount`/`contractCount` in batch events reflect the **actual** count of entries stored, excluding:

- Zero addresses/hashes (skipped silently)
- Already-registered entries (skipped silently, no revert)

---

## dataHash Commitment Pattern (Transaction Registry)

Transaction registration uses a commit-reveal scheme to prevent front-running:

```text
1. Reporter computes: dataHash = keccak256(abi.encode(txHashes, chainIds))
2. Phase 1: acknowledgeTransactions(..., dataHash, ...) — hides tx hashes
3. Grace period (1-4 min)
4. Phase 2: registerTransactions(..., txHashes[], chainIds[]) — reveals hashes
5. Contract recomputes dataHash from arrays, verifies match
```

This prevents a front-runner from seeing the acknowledge transaction in the mempool, extracting the transaction hashes, and registering them first.

---

## Cross-Chain Path

When a spoke chain registration arrives at the hub via Hyperlane:

1. `CrossChainInbox` receives the message
2. Routes to `FraudRegistryHub`
3. Hub calls `registerFromHub()` on the appropriate registry
4. Both `WalletRegistered` and `CrossChainWalletRegistered` events fire
5. No duplicate batch event (only `TransactionBatchRegistered`, not also `TransactionBatchCreated`)

---

## What the Contract Stores vs Emits

| Aspect              | Storage                    | Events                   |
| ------------------- | -------------------------- | ------------------------ |
| Gas cost            | High (~20K per SSTORE)     | Low (~375 per log topic) |
| Queryable on-chain  | Yes (O(1) mapping lookups) | No                       |
| Queryable off-chain | Via RPC                    | Via indexer (Ponder)     |
| Historical data     | Current state only         | Full history             |

**Trade-off:** Store only what's needed for on-chain verification (`isRegistered()` checks). Emit everything else for the indexer to build rich query interfaces (search, dashboard, batch details).

---

## Batch Operation Economics (Base L2)

From stress tests:

| Registry    | Gas/Entry | Max Batch (25M limit) |
| ----------- | --------- | --------------------- |
| Wallet      | ~3,730    | ~6,700                |
| Contract    | ~3,670    | ~6,800                |
| Transaction | ~3,160    | ~7,900                |

**Cost at Base L2 gas prices:**

| Batch Size | Gas Used | Cost @ 0.001 gwei | Cost @ 0.01 gwei |
| ---------- | -------- | ----------------- | ---------------- |
| 1,000      | ~3.5M    | ~$0.000035        | ~$0.00035        |
| 5,000      | ~20M     | ~$0.0002          | ~$0.002          |

5,000 entries per batch is the recommended production limit.

**Uploading 1M fraud records costs under $1 even at 10x gas prices.**

---

## CAIP-2 Resolution

The indexer resolves `bytes32` chain ID hashes to human-readable CAIP-2 strings at indexing time:

```typescript
import { resolveChainIdHash, caip2ToNumericChainId } from '@swr/chains';

// bytes32 → "eip155:8453"
const caip2 = resolveChainIdHash(reportedChainId);

// "eip155:8453" → 8453
const numeric = caip2ToNumericChainId(caip2);
```

GraphQL consumers get readable chain identifiers without decoding hashes themselves.

---

## File Reference

| File                                                        | Purpose                              |
| ----------------------------------------------------------- | ------------------------------------ |
| `packages/contracts/src/registries/WalletRegistry.sol`      | Wallet storage + events              |
| `packages/contracts/src/registries/TransactionRegistry.sol` | Transaction storage + events         |
| `packages/contracts/src/registries/ContractRegistry.sol`    | Contract storage + events            |
| `packages/contracts/src/hub/FraudRegistryHub.sol`           | Hub router, cross-chain entry point  |
| `packages/contracts/src/spoke/SpokeRegistry.sol`            | Spoke chain wallet + tx registration |
| `packages/contracts/src/libraries/CAIP2.sol`                | Chain ID encoding                    |
| `packages/caip/src/index.ts`                                | TypeScript CAIP-2 utilities          |
| `packages/chains/src/index.ts`                              | Chain config, resolveChainIdHash     |
| `apps/indexer/src/index.ts`                                 | Ponder event handlers                |
| `apps/indexer/ponder.config.ts`                             | Indexed contracts + ABIs             |

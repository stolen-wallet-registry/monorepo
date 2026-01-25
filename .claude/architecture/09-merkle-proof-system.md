# Merkle Proof System

This document covers the merkle tree implementation, CAIP chain identifiers, proof generation/verification, gas optimizations, and batch operation economics on Base L2.

---

## Core Libraries

### MerkleRootComputation.sol

**Location:** `packages/contracts/src/libraries/MerkleRootComputation.sol`

Solidity library for on-chain merkle operations. Fully compatible with OpenZeppelin's `StandardMerkleTree` (JS) and `MerkleProof` (Solidity).

```solidity
library MerkleRootComputation {
    error LeavesNotSorted();

    /// @notice Compute leaf hash for (address, bytes32) pair
    /// @dev Matches OZ StandardMerkleTree.of(values, ['address', 'bytes32']) v1.0.8+
    function hashLeaf(address addr, bytes32 value) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(addr, value))));
    }

    /// @notice Compute leaf hash for (bytes32, bytes32) pair
    function hashLeaf(bytes32 value1, bytes32 value2) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(keccak256(abi.encode(value1, value2))));
    }

    /// @notice Compute root from PRE-SORTED leaves (O(n) verification)
    /// @dev Reverts if leaves not sorted ascending. Caller must sort off-chain.
    function computeRootFromSorted(bytes32[] memory leaves) internal pure returns (bytes32);
}
```

**Leaf Format (OpenZeppelin StandardMerkleTree v1.0.8+):**

```text
leaf = keccak256(keccak256(abi.encode(value1, value2)))
```

The double-keccak256 provides domain separation between leaves and internal nodes:

- Leaves use double hash: `keccak256(keccak256(...))`
- Internal nodes use single hash: `keccak256(left || right)`

This prevents second-preimage attacks without requiring a prefix byte.

> **Note**: OZ v1.0.8+ removed the `0x00` prefix used in earlier versions. The double-keccak256 approach provides equivalent security with simpler implementation.

---

### @swr/merkle Package

**Location:** `packages/merkle/`

TypeScript library for off-chain merkle tree operations.

```typescript
// packages/merkle/src/tree.ts
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Hex } from 'viem';
import { sortWalletEntries } from './sort';

export function buildWalletMerkleTree(entries: WalletEntry[]): MerkleTreeResult<WalletEntry> {
  if (entries.length === 0) {
    throw new Error('Cannot build tree with zero entries');
  }

  // Sort entries by leaf hash (required for on-chain verification)
  const sortedEntries = sortWalletEntries(entries);

  // Build values array: [address, chainId]
  const values = sortedEntries.map((e) => [e.address, e.chainId] as [string, string]);

  // Create tree - entries already sorted, disable internal sort to avoid double-sorting
  const tree = StandardMerkleTree.of(values, ['address', 'bytes32'], { sortLeaves: false });

  return {
    root: tree.root as Hex,
    tree,
    entries: sortedEntries,
    leafCount: sortedEntries.length,
  };
}

export function getWalletProof(tree: StandardMerkleTree, address: Address, chainId: Hex): Hex[] {
  // Case-insensitive lookup
  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === address.toLowerCase() && v[1] === chainId) {
      return tree.getProof(i);
    }
  }
  throw new Error('Entry not found in tree');
}
```

**Key Functions:**

| Function                                | Purpose                         |
| --------------------------------------- | ------------------------------- |
| `buildWalletMerkleTree()`               | Build tree for wallet entries   |
| `buildTransactionMerkleTree()`          | Build tree for tx hash entries  |
| `buildContractMerkleTree()`             | Build tree for contract entries |
| `getWalletProof()`                      | Get inclusion proof for wallet  |
| `serializeTree()` / `deserializeTree()` | Persist tree to JSON            |

---

### @swr/caip Package

**Location:** `packages/caip/`

CAIP-2 chain identifier utilities. All registry entries include a chain ID as `bytes32`.

```typescript
// packages/caip/src/index.ts

// Convert EIP-155 chain ID to bytes32
export function chainIdToBytes32(chainId: bigint): Hex {
  return `0x${chainId.toString(16).padStart(64, '0')}`;
}

// Parse CAIP-2 string to bytes32
export function caip2ToBytes32(caip2: string): Hex {
  // "eip155:8453" -> bytes32
  const [namespace, reference] = caip2.split(':');
  if (namespace === 'eip155') {
    return chainIdToBytes32(BigInt(reference));
  }
  throw new Error(`Unsupported namespace: ${namespace}`);
}
```

**Solidity equivalent:**

```solidity
// packages/contracts/src/libraries/CAIP2.sol
library CAIP2 {
    function fromEIP155(uint256 chainId) internal pure returns (bytes32) {
        return bytes32(chainId);
    }
}
```

---

## How Merkle Proofs Work

### Tree Structure

```text
                    ┌─────────┐
                    │  ROOT   │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
         ┌────┴────┐           ┌────┴────┐
         │ H(0,1)  │           │ H(2,3)  │
         └────┬────┘           └────┬────┘
              │                     │
        ┌─────┴─────┐         ┌─────┴─────┐
        │           │         │           │
     leaf_0      leaf_1    leaf_2      leaf_3
        ↑           ↑         ↑           ↑
    (addr_0,    (addr_1,  (addr_2,   (addr_3,
     chain_0)   chain_1)  chain_2)   chain_3)
```

**Leaves sorted ascending by hash value.**

### Proof Generation (Off-chain)

To prove `leaf_2` is in the tree:

```text
proof = [leaf_3, H(0,1)]
```

### Proof Verification (On-chain)

```solidity
// Using OpenZeppelin MerkleProof
bool valid = MerkleProof.verify(proof, root, leaf);

// Verification algorithm:
// 1. hash = leaf_2
// 2. hash = H(hash, leaf_3)  // sibling
// 3. hash = H(H(0,1), hash)  // uncle
// 4. return hash == root
```

---

## Usage in Registries

### Individual Registration (with proof)

Users can prove their wallet was in a published batch:

```solidity
function verifyInclusion(
    bytes32 root,
    address wallet,
    bytes32 chainId,
    bytes32[] calldata proof
) public view returns (bool) {
    bytes32 leaf = MerkleRootComputation.hashLeaf(wallet, chainId);
    return MerkleProof.verify(proof, root, leaf);
}
```

### Batch Registration (operator)

Operators submit full batch, contract recomputes root:

```solidity
function registerBatchAsOperator(
    bytes32 expectedRoot,
    bytes32 chainId,
    address[] calldata wallets,
    bytes32[] calldata walletChainIds
) external onlyApprovedOperator {
    // Build leaves
    bytes32[] memory leaves = new bytes32[](wallets.length);
    for (uint256 i = 0; i < wallets.length; i++) {
        leaves[i] = MerkleRootComputation.hashLeaf(wallets[i], walletChainIds[i]);
    }

    // Recompute root (reverts if not sorted)
    bytes32 computed = MerkleRootComputation.computeRootFromSorted(leaves);
    require(computed == expectedRoot, "Root mismatch");

    // Store entries...
}
```

---

## End-to-End Data Flow

### High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW OVERVIEW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OPERATOR (Off-chain)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. Collect fraud data (wallets, txs, contracts)                     │    │
│  │ 2. Build merkle tree with @swr/merkle                               │    │
│  │ 3. Sort entries by leaf hash                                        │    │
│  │ 4. Store tree for future proof generation                           │    │
│  │ 5. Submit batch tx: (root, addresses[], chainIds[])                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  CONTRACT (On-chain) ─────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 6. Verify operator approved                                         │    │
│  │ 7. Recompute leaves from input arrays                               │    │
│  │ 8. Verify leaves sorted (O(n) check)                                │    │
│  │ 9. Compute merkle root                                              │    │
│  │ 10. Verify computed root == expected root                           │    │
│  │ 11. STORE: merkle root + batch metadata (minimal)                   │    │
│  │ 12. EMIT: Batch event with full arrays (for indexers)               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  INDEXER (Off-chain) ─────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 13. Listen for WalletBatchRegistered / TransactionBatchRegisteredByOperator │    │
│  │ 14. Listen for ContractBatchRegistered                              │    │
│  │ 15. Build searchable database of all entries                        │    │
│  │ 16. Serve queries: "is wallet X registered?"                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What the Contract Stores vs Emits

**Storage (Minimal - gas efficient):**

```solidity
// Only essential state for on-chain verification
mapping(bytes32 => bool) public registeredBatches;      // batchId => registered
mapping(address => mapping(bytes32 => bool)) public isRegistered; // wallet => chainId => bool
```

**Events (Rich - for indexers):**

```solidity
// Wallet batch (operator)
event WalletBatchRegistered(
    bytes32 indexed batchId,
    bytes32 indexed merkleRoot,
    address indexed operator,
    bytes32 reportedChainId,
    uint32 walletCount,
    address[] walletAddresses,
    bytes32[] chainIds
);

// Transaction batch (operator)
event TransactionBatchRegisteredByOperator(
    bytes32 indexed batchId,
    bytes32 indexed merkleRoot,
    address indexed operator,
    bytes32 reportedChainId,
    uint32 transactionCount,
    bytes32[] txHashes,
    bytes32[] chainIds
);

// Fraudulent contracts (operator)
event ContractBatchRegistered(
    bytes32 indexed batchId,
    bytes32 indexed merkleRoot,
    address indexed operator,
    bytes32 reportedChainId,
    uint32 contractCount,
    address[] contractAddresses,
    bytes32[] chainIds
);
```

### Why This Design?

| Aspect              | Storage                | Events                   |
| ------------------- | ---------------------- | ------------------------ |
| Gas cost            | High (~20K per SSTORE) | Low (~375 per log topic) |
| Queryable on-chain  | Yes                    | No                       |
| Queryable off-chain | Via RPC                | Via indexer              |
| Historical data     | Current state only     | Full history             |

**Trade-off:** Store only what's needed for on-chain verification (isRegistered checks). Emit everything else for indexers to build rich query interfaces.

### Indexer Integration

```typescript
// Example: Listening for registry events
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http() });

// Watch for new wallet batch registrations
client.watchContractEvent({
  address: WALLET_REGISTRY_ADDRESS,
  abi: walletRegistryAbi,
  eventName: 'WalletBatchRegistered',
  onLogs: (logs) => {
    for (const log of logs) {
      console.log('New batch:', {
        root: log.args.merkleRoot,
        operator: log.args.operator,
        count: log.args.walletCount,
      });
    }
  },
});

// Watch for individual wallet registrations (self-attested)
client.watchContractEvent({
  address: WALLET_REGISTRY_ADDRESS,
  abi: walletRegistryAbi,
  eventName: 'WalletRegistered',
  onLogs: async (logs) => {
    // Process logs with proper error handling
    const insertPromises = logs.map((log) =>
      db.wallets.insert({
        address: log.args.wallet,
        chainId: log.args.chainId,
        registrant: log.args.registrant,
        timestamp: log.args.timestamp,
        txHash: log.transactionHash,
      })
    );

    try {
      await Promise.all(insertPromises);
    } catch (error) {
      console.error('Failed to index wallet registrations:', error);
      // Queue for retry or send to dead letter queue
    }
  },
});
```

### Query Patterns

**On-chain (direct contract call):**

```solidity
// Simple boolean check - stored in contract
bool stolen = walletRegistry.isRegistered(walletAddress, chainId);
```

**Off-chain (via indexer API):**

```typescript
// Rich queries via indexer
const result = await indexer.query({
  wallet: '0x123...',
  includeHistory: true,
  includeOperator: true,
  includeProof: true,
});

// Returns:
// {
//   registered: true,
//   chainId: 'eip155:8453',
//   operator: '0xCoinbase...',
//   batchRoot: '0xabc...',
//   timestamp: 1704067200,
//   proof: ['0x...', '0x...'],  // merkle proof for verification
// }
```

### Proof Retrieval Flow

After batch registration, users/services can verify inclusion:

```text
1. Query indexer: "Is wallet X in the registry?"
2. Indexer returns: { registered: true, batchRoot: 0xabc, proof: [...] }
3. Optionally verify on-chain:
   MerkleProof.verify(proof, batchRoot, hashLeaf(wallet, chainId))
4. Trust established without querying contract state
```

This enables light clients and cross-chain verification where the full registry state isn't available.

---

## Gas Optimization: Pre-Sorted Leaves

### The Problem

Original implementation sorted on-chain with O(n²) insertion sort:

```solidity
// O(n²) - 1000 entries = ~1M iterations
for (uint256 i = 1; i < length; i++) {
    uint256 j = i;
    while (j > 0 && leaves[j-1] > leaves[j]) {
        swap(leaves[j], leaves[j-1]);
        j--;
    }
}
```

### The Solution

Require pre-sorted input, verify with O(n):

```solidity
// O(n) - 1000 entries = 1000 iterations
for (uint256 i = 1; i < length; i++) {
    if (leaves[i-1] >= leaves[i]) revert LeavesNotSorted();
}
```

### Gas Savings

| Batch Size | O(n²) Sort | O(n) Verify | Savings |
| ---------- | ---------- | ----------- | ------- |
| 100        | ~450K      | ~380K       | 15%     |
| 500        | ~2.5M      | ~1.8M       | 28%     |
| 1,000      | ~5M        | ~3.5M       | 30%     |
| 2,500      | ~15M       | ~9M         | 40%     |

---

## Batch Operation Economics (Base L2)

### Gas Per Entry

From stress tests:

| Registry    | Gas/Entry | Max Batch (25M limit) |
| ----------- | --------- | --------------------- |
| Wallet      | ~3,730    | ~6,700                |
| Contract    | ~3,670    | ~6,800                |
| Transaction | ~3,160    | ~7,900                |

### Conservative Production Limit

5,000 entries per batch is recommended for production deployments.

### Cost Structure

Base L2 assumptions:

- Block time: 2 seconds
- Gas limit: 25M per tx
- Base fee: ~0.001 gwei (varies)

| Batch Size | Gas Used | Cost @ 0.001 gwei | Cost @ 0.01 gwei |
| ---------- | -------- | ----------------- | ---------------- |
| 1,000      | ~3.5M    | ~$0.000035        | ~$0.00035        |
| 2,500      | ~9M      | ~$0.00009         | ~$0.0009         |
| 5,000      | ~20M     | ~$0.0002          | ~$0.002          |

### Operator Import Scenarios

| Dataset      | Batches | Total Gas | Est. Cost | Time  |
| ------------ | ------- | --------- | --------- | ----- |
| 50K wallets  | 10      | 200M      | ~$0.002   | ~20s  |
| 200K wallets | 40      | 800M      | ~$0.008   | ~80s  |
| 1M entries   | 200     | 4B        | ~$0.04    | ~7min |

**Uploading 1M fraud records costs under $1 even at 10x gas prices.**

### Throughput

- Max entries/block: ~5,000 (one full batch)
- Entries/minute: ~150,000
- Entries/hour: ~9,000,000

The registry can absorb entire industry fraud datasets rapidly.

---

## File Reference

| File                                                         | Purpose                                 |
| ------------------------------------------------------------ | --------------------------------------- |
| `packages/contracts/src/libraries/MerkleRootComputation.sol` | On-chain leaf hashing, root computation |
| `packages/contracts/src/libraries/CAIP2.sol`                 | Chain ID encoding                       |
| `packages/merkle/src/tree.ts`                                | Off-chain tree building                 |
| `packages/merkle/src/proof.ts`                               | Proof generation/verification           |
| `packages/merkle/src/leaf.ts`                                | Leaf hash computation                   |
| `packages/merkle/src/serialize.ts`                           | Tree serialization                      |
| `packages/caip/src/index.ts`                                 | CAIP-2 utilities                        |
| `packages/contracts/test/StressTest.t.sol`                   | Gas scaling tests                       |
| `packages/contracts/test/helpers/MerkleTestHelper.sol`       | Test utilities                          |

---

## Test Coverage

### TypeScript Tests

```bash
# packages/merkle
pnpm test

# Tests:
# - Tree building for all entry types
# - Proof generation and retrieval
# - Serialization round-trip
# - Case-insensitive address matching
# - Empty/single entry edge cases
```

### Solidity Stress Tests

```bash
# packages/contracts
forge test --match-contract StressTest -vv

# Tests:
# - testWalletBatch1500: 1500 wallet entries
# - testTxBatch1500: 1500 transaction entries
# - testContractBatch1500: 1500 contract entries
# - testUnsortedInputReverts: Unsorted rejection
# - testContractRegistryNoLimit: No artificial batch limit
```

Uses `vm.pauseGasMetering()` to exclude test setup from gas measurement.

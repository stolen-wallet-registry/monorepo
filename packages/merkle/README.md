# @swr/merkle

Merkle tree helpers for SWR operator batch submissions (wallets, transactions, and contracts).

## Core Concepts

- Uses OpenZeppelin `StandardMerkleTree` for compatibility with on-chain verification.
- Entries **must be pre-sorted by leaf hash** before submission.
- Leaves use the OZ standard leaf format (`keccak256(keccak256(abi.encode(...)))`).

## Entry Types

| Registry     | Leaf Tuple                          |
| ------------ | ----------------------------------- |
| Wallets      | `(address, bytes32 chainId)`        |
| Transactions | `(bytes32 txHash, bytes32 chainId)` |
| Contracts    | `(address, bytes32 chainId)`        |

`chainId` is a CAIP-2 chain identifier encoded as `bytes32`.

## Build a Tree

```ts
import { buildWalletMerkleTree } from '@swr/merkle';
import { chainIdToBytes32 } from '@swr/caip';

const entries = [
  { address: '0x1234...', chainId: chainIdToBytes32(8453n) },
  { address: '0xabcd...', chainId: chainIdToBytes32(1n) },
];

const { root, tree, entries: sortedEntries } = buildWalletMerkleTree(entries);
```

Use `sortedEntries` when building calldata for contracts.

## Proofs

```ts
import { getWalletProof } from '@swr/merkle';

const proof = getWalletProof(tree, '0x1234...', chainIdToBytes32(8453n));
```

## Exports

- `buildWalletMerkleTree`, `buildTransactionMerkleTree`, `buildContractMerkleTree`
- `getWalletProof`, `getTransactionProof`, `getContractProof`
- `serializeTree`, `deserializeTree`
- `sortWalletEntries`, `sortTransactionEntries`, `sortContractEntries`

## Notes

Contracts verify proofs using `MerkleRootComputation.sol`, which expects sorted leaves.

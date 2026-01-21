# SWR Operator CLI

Command-line tools for Stolen Wallet Registry operators.

## Installation

```bash
pnpm install
pnpm build
```

## Configuration

Create `.env` file:

```bash
# Operator private key (Anvil address 3 for local testing)
OPERATOR_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

## Local Development Testing

### 1. Start Anvil and Deploy Contracts

```bash
# Terminal 1: Start Anvil
anvil

# Terminal 2: Deploy contracts
cd packages/contracts
pnpm deploy:local

# Note the contract addresses from output
```

### 2. Update CLI Config

Edit `src/lib/config.ts` with deployed addresses from step 1.

### 3. Test CLI

```bash
# Build CLI
pnpm build

# Dry run (no transaction)
pnpm swr submit-contracts \
  --file test/fixtures/contracts.json \
  --network local \
  --dry-run

# Submit batch
pnpm swr submit-contracts \
  --file test/fixtures/contracts.json \
  --network local \
  --output-dir ./output
```

## Commands

### submit-contracts

Submit a batch of fraudulent contracts.

```bash
swr submit-contracts --file <path> [options]

Options:
  -f, --file <path>       Input file (JSON or CSV) [required]
  -n, --network <network> Network: local, testnet, mainnet [default: local]
  -k, --private-key <key> Operator private key (or set OPERATOR_PRIVATE_KEY)
  -c, --chain-id <id>     Default chain ID for entries [default: 8453]
  -o, --output-dir <path> Directory to save Merkle tree
  --dry-run               Simulate without submitting
```

### submit-wallets

Submit a batch of stolen wallets.

```bash
swr submit-wallets --file <path> [options]
```

### submit-transactions

Submit a batch of stolen transactions.

```bash
swr submit-transactions --file <path> [options]
```

### quote

Get fee quote for batch submission.

```bash
swr quote [options]

Options:
  -n, --network <network> Network: local, testnet, mainnet
  -t, --type <type>       Registry type: wallet, transaction, contract
```

### verify

Verify an entry exists in the registry.

```bash
swr verify --address <address> [options]

Options:
  -a, --address <address> Address to verify [required]
  -n, --network <network> Network: local, testnet, mainnet
  -c, --chain-id <id>     Chain ID
  -t, --type <type>       Registry type: wallet, contract
```

## Input File Formats

### JSON

```json
[
  { "address": "0x123...", "chainId": 8453 },
  { "address": "0xabc...", "chainId": "eip155:1" }
]
```

### CSV

```csv
address,chainId
0x123...,8453
0xabc...,eip155:1
```

Chain ID can be:

- Numeric: `8453`, `1`
- CAIP-2 format: `eip155:8453`, `eip155:1`

If `chainId` is omitted, defaults to Base (8453).

## Output

After submission, the CLI saves the Merkle tree to the output directory. This file is needed for:

- Generating proofs for individual entries
- Verifying entries off-chain
- Auditing submissions

## Merkle Tree Compatibility

This CLI uses OpenZeppelin's `StandardMerkleTree` which is fully compatible with the on-chain registry contracts. The leaf format matches exactly:

```typescript
// CLI (using @openzeppelin/merkle-tree)
const tree = StandardMerkleTree.of(values, ['address', 'bytes32']);

// Solidity (MerkleRootComputation.sol)
// keccak256(bytes.concat(bytes1(0x00), keccak256(abi.encode(addr, chainId))))
```

No custom Merkle code is needed - the library handles everything.

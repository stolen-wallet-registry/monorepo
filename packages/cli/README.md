# SWR Operator CLI

Command-line tools for Stolen Wallet Registry operators.

## Installation

```bash
pnpm install
pnpm build
```

## Commands

| Command               | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `submit-contracts`    | Submit batch of fraudulent contracts (operators only) |
| `submit-wallets`      | Submit batch of stolen wallets (operators only)       |
| `submit-transactions` | Submit batch of stolen transactions (operators only)  |
| `quote`               | Get fee quote for batch submission                    |
| `verify`              | Verify an entry exists in the registry                |

### Common Options

```
-e, --env <env>         Environment: local, testnet, mainnet [default: local]
-k, --private-key <key> Operator private key (or set OPERATOR_PRIVATE_KEY env)
-c, --chain-id <id>     Default chain ID [default: 8453]
-o, --output-dir <path> Directory to save Merkle tree and transaction data
--dry-run               Simulate without submitting
--build-only            Build transaction data for multisig (no private key needed)
```

---

## End-to-End Testing Guide

### Prerequisites

Start the local development environment:

```bash
# Terminal 1: Start both Anvil nodes
pnpm anvil:crosschain

# Terminal 2: Deploy contracts
pnpm deploy:crosschain
```

After deployment, you'll see the pre-approved operators in the output:

```
Operator A (ALL): 0x90F79bf6EB2c4f870365E785982E1f101E93b906
Operator B (CONTRACT): 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
```

### Anvil Test Accounts

| Account | Address                                      | Capabilities                 | Private Key                                                          |
| ------- | -------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| 3       | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | ALL (wallet + tx + contract) | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| 4       | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | CONTRACT only                | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |
| 5       | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | NOT approved                 | `0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba` |

---

## Test Scenarios

### Scenario 1: Approved Operator (Direct Submission)

An individual operator with a private key submitting directly.

#### 1.1 Submit Fraudulent Contracts (Operator A - has ALL permissions)

```bash
# Build the CLI first
pnpm --filter @swr/cli build

# Dry run to see what would happen
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  --dry-run

# Actually submit
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  -o ./output
```

**Expected:** Transaction succeeds, Merkle tree saved to `./output/`

#### 1.2 Submit Stolen Wallets (Operator A)

```bash
pnpm --filter @swr/cli swr submit-wallets \
  -f test/fixtures/wallets.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  -o ./output
```

**Expected:** Transaction succeeds

#### 1.3 Submit Stolen Transactions (Operator A)

```bash
pnpm --filter @swr/cli swr submit-transactions \
  -f test/fixtures/transactions.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  -o ./output
```

**Expected:** Transaction succeeds

#### 1.4 Verify Submissions

```bash
# Verify a contract was registered
pnpm --filter @swr/cli swr verify \
  -a 0x1234567890123456789012345678901234567890 \
  -e local \
  -c 8453 \
  -t contract

# Verify a wallet was registered
pnpm --filter @swr/cli swr verify \
  -a 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 \
  -e local \
  -c 8453 \
  -t wallet
```

**Expected:** Shows registration status and batch details

---

### Scenario 2: Limited Operator (Permission Boundary Test)

Operator B only has CONTRACT permissions. Testing permission boundaries.

#### 2.1 Submit Contracts (Should Succeed)

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a \
  -o ./output
```

**Expected:** Transaction succeeds (Operator B has CONTRACT permission)

#### 2.2 Submit Wallets (Should FAIL)

```bash
pnpm --filter @swr/cli swr submit-wallets \
  -f test/fixtures/wallets.json \
  -e local \
  -k 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

**Expected:** Transaction reverts with `NotApprovedOperator` error

#### 2.3 Submit Transactions (Should FAIL)

```bash
pnpm --filter @swr/cli swr submit-transactions \
  -f test/fixtures/transactions.json \
  -e local \
  -k 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

**Expected:** Transaction reverts with `NotApprovedOperator` error

---

### Scenario 3: Unapproved User (Should Fail)

Testing that non-operators cannot submit.

```bash
# Account 5 is NOT an approved operator
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
```

**Expected:** Transaction reverts with `NotApprovedOperator` error

---

### Scenario 4: DAO/Multisig Workflow (--build-only)

For DAOs using Safe or other multisig wallets.

#### 4.1 Build Transaction Data (No Private Key Needed)

```bash
# Generate transaction JSON for multisig import
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  --build-only \
  -o ./multisig-output
```

**Output files:**

- `multisig-output/tx-contracts-<timestamp>.json` - Import into Safe
- `multisig-output/tree-contracts-<timestamp>.json` - Keep for verification

#### 4.2 Transaction JSON Format

```json
{
  "to": "0x59b670e9fA9D0A427751Af201D676719a970857b",
  "value": "7142857142857142",
  "data": "0x...",
  "operation": 0,
  "description": "Register 3 fraudulent contracts (Merkle root: 0xa9f47cbd...)",
  "merkleRoot": "0xa9f47cbd6b879589ed0791f077031e9b1bca924ff60c4daaccc62acbf7a62056",
  "entryCount": 3
}
```

#### 4.3 Import into Safe

1. Go to Safe UI → New Transaction → Transaction Builder
2. Enter `to` address
3. Enter `value` (in wei)
4. Paste `data` as hex
5. Submit for signatures

#### 4.4 Build for All Registry Types

```bash
# Wallets
pnpm --filter @swr/cli swr submit-wallets \
  -f test/fixtures/wallets.json \
  -e local \
  --build-only \
  -o ./multisig-output

# Transactions
pnpm --filter @swr/cli swr submit-transactions \
  -f test/fixtures/transactions.json \
  -e local \
  --build-only \
  -o ./multisig-output
```

---

### Scenario 5: Fee Quotes

Check registration fees before submitting.

```bash
# Quote for contract registry
pnpm --filter @swr/cli swr quote -e local -t contract

# Quote for wallet registry
pnpm --filter @swr/cli swr quote -e local -t wallet

# Quote for transaction registry
pnpm --filter @swr/cli swr quote -e local -t transaction
```

**Expected:** Shows fee in ETH for batch registration

---

## Input File Formats

### JSON

```json
[
  { "address": "0x123...", "chainId": 8453 },
  { "address": "0xabc...", "chainId": "eip155:1" },
  { "address": "0xdef..." }
]
```

### CSV

```csv
address,chainId
0x123...,8453
0xabc...,eip155:1
0xdef...
```

### Transaction File (for submit-transactions)

```json
[
  { "txHash": "0x123...64chars", "chainId": 8453 },
  { "txHash": "0xabc...64chars", "chainId": 1 }
]
```

**Chain ID formats:**

- Numeric: `8453`, `1`
- CAIP-2: `eip155:8453`, `eip155:1`
- Omitted: defaults to Base (8453)

---

## Troubleshooting

### "Contract addresses not configured for environment"

The `@swr/chains` package doesn't have addresses for your environment. For local testing, ensure you've run `pnpm deploy:crosschain` and the addresses match `packages/chains/src/networks/anvil-hub.ts`.

### "NotApprovedOperator" Error

Your wallet is not an approved operator. For local testing:

- Use Account 3 (all permissions) or Account 4 (contracts only)
- Or add yourself via the OperatorRegistry contract

### "Insufficient funds"

Registration requires a fee. Check with `swr quote` and ensure your wallet has enough ETH.

### Transaction Reverts Without Clear Error

Run with `--dry-run` first to simulate. Check:

1. Operator permissions match registry type
2. Sufficient ETH for fee
3. Contract addresses are correct

---

## Environment Configuration

The CLI uses `@swr/chains` for network configuration. Contract addresses are defined in:

| Environment | Config File                                    |
| ----------- | ---------------------------------------------- |
| `local`     | `packages/chains/src/networks/anvil-hub.ts`    |
| `testnet`   | `packages/chains/src/networks/base-sepolia.ts` |
| `mainnet`   | `packages/chains/src/networks/base.ts`         |

---

## Merkle Tree Compatibility

This CLI uses OpenZeppelin's `StandardMerkleTree` which is fully compatible with the on-chain registry contracts:

```typescript
// CLI (using @openzeppelin/merkle-tree)
const tree = StandardMerkleTree.of(values, ['address', 'bytes32']);

// Solidity (MerkleRootComputation.sol)
// keccak256(bytes.concat(bytes1(0x00), keccak256(abi.encode(addr, chainId))))
```

The Merkle tree files saved to `--output-dir` can be used for:

- Generating proofs for individual entries
- Verifying entries off-chain
- Auditing submissions

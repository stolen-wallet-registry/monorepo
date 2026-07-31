# SWR Operator cli

Command-line tools for approved operators to batch-submit registry entries.

## Installation

From the repo root:

```bash
pnpm install
pnpm --filter @swr/cli build
```

## Commands

| Command               | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `submit-contracts`    | Submit a batch of fraudulent contracts (operators only) |
| `submit-wallets`      | Submit a batch of stolen wallets (operators only)       |
| `submit-transactions` | Submit a batch of stolen transactions (operators only)  |
| `quote`               | Get fee quote for a registry                            |
| `verify`              | Verify a wallet or contract entry                       |

### Common Options

```text
-e, --env <env>         Environment: local, testnet, mainnet [default: local]
--build-only            Build transaction data for multisig (no key needed)
--keystore <path>       Encrypted V3 keystore file (passphrase prompted)
-c, --chain-id <id>     Default chain ID for entries [default: 8453]
-o, --output-dir <path> Directory to save transaction data
--dry-run               Simulate without submitting
-k, --private-key <key> Plaintext key — LOCAL DEVELOPMENT ONLY (see below)
```

## Signing credentials

The operator identity is the highest-value credential in this system: it can permanently and
irreversibly mark arbitrary third-party addresses as stolen or fraudulent. Choose accordingly.

| Method                 | Allowed on          | Use for                                     |
| ---------------------- | ------------------- | ------------------------------------------- |
| `--build-only`         | everywhere          | **Mainnet default.** Sign in your multisig. |
| `--keystore <path>`    | everywhere          | A hot operator key on testnet/mainnet.      |
| `OPERATOR_PRIVATE_KEY` | everywhere (warns)  | CI where a keystore is impractical.         |
| `-k, --private-key`    | **`-e local` only** | Anvil development keys.                     |

### `--private-key` is refused on testnet and mainnet

Process arguments are world-readable: any local user can read them with `ps auxww` or
`/proc/<pid>/cmdline`. They also land in shell history, CI job logs, `strace` output and
process-audit records. A real operator key passed on argv must be assumed disclosed, so the CLI
refuses the flag outright for `-e testnet` and `-e mainnet`:

```console
$ swr submit-contracts -f entries.json -e mainnet -k 0x...
Error: --private-key is not permitted for -e mainnet. ...
```

It stays available for `-e local`, where the intended keys are Anvil's published development
defaults and there is nothing to disclose.

### Mainnet: `--build-only` + multisig (recommended)

No key ever touches the operator host. Build the calldata, then sign it in Safe:

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f ./entries.json \
  -e mainnet \
  --build-only \
  -o ./output
```

Import the resulting JSON into the Safe Transaction Builder.

### Mainnet/testnet with a hot key: `--keystore`

Use an encrypted [Web3 Secret Storage V3](https://ethereum.org/en/developers/docs/data-structures-and-encoding/web3-secret-storage/)
keystore — the kind `geth account new`, `cast wallet import`, or ethers produces. The passphrase
is prompted interactively and is never echoed, never logged, and never placed on argv:

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f ./entries.json \
  -e mainnet \
  --keystore ~/.swr/operator-keystore.json \
  -o ./output
# Passphrase for /Users/you/.swr/operator-keystore.json: (not echoed)
```

For non-interactive CI, set `SWR_KEYSTORE_PASSWORD` in the environment instead of being prompted.
Prefer your CI's secret store over a plaintext variable in a config file.

### `OPERATOR_PRIVATE_KEY`

Still accepted on every environment, and warned about on non-local ones. An environment variable
is not world-readable the way argv is, but it is still a plaintext key sitting in process memory
and in whatever provisioned it. Prefer `--keystore`, or `--build-only` with a multisig.

## Examples

These run against `-e local`. `OPERATOR_PRIVATE_KEY` is read from the environment (or `.env`)
automatically, so it does not need to be passed on the command line.

### Submit contracts

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -o ./output
```

### Submit wallets

```bash
pnpm --filter @swr/cli swr submit-wallets \
  -f test/fixtures/wallets.json \
  -e local \
  -o ./output
```

### Submit transactions

```bash
pnpm --filter @swr/cli swr submit-transactions \
  -f test/fixtures/transactions.json \
  -e local \
  -o ./output
```

### Quote fees

```bash
pnpm --filter @swr/cli swr quote -e local -t contract
pnpm --filter @swr/cli swr quote -e local -t wallet
pnpm --filter @swr/cli swr quote -e local -t transaction
```

### Verify entries

```bash
pnpm --filter @swr/cli swr verify -e local -t contract -a 0x1234...
pnpm --filter @swr/cli swr verify -e local -t wallet -a 0x1234...
```

---

## End-to-End Testing Guide

### Prerequisites

Start the local cross-chain environment:

```bash
# Terminal 1: Start both Anvil nodes
pnpm anvil:crosschain

# Terminal 2: Deploy contracts
pnpm deploy:crosschain
```

After deployment, you will see the pre-approved operators in output:

```text
Operator A (ALL): 0x90F79bf6EB2c4f870365E785982E1f101E93b906
Operator B (CONTRACT): 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
```

### Anvil Test Accounts

> ⚠️ These keys are public dev defaults. Never use or fund them on public testnets or mainnet.

| Account | Address                                      | Capabilities                 | Private Key                                                          |
| ------- | -------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| 3       | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | ALL (wallet + tx + contract) | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| 4       | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | CONTRACT only                | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |
| 5       | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | NOT approved                 | `0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba` |

---

## Test Scenarios

### Scenario 1: Approved Operator (Direct Submission)

#### 1.1 Submit Fraudulent Contracts (Operator A - ALL permissions)

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  --dry-run

pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  -o ./output
```

#### 1.2 Submit Stolen Wallets (Operator A)

```bash
pnpm --filter @swr/cli swr submit-wallets \
  -f test/fixtures/wallets.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  -o ./output
```

#### 1.3 Submit Stolen Transactions (Operator A)

```bash
pnpm --filter @swr/cli swr submit-transactions \
  -f test/fixtures/transactions.json \
  -e local \
  -k 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  -o ./output
```

#### 1.4 Verify Submissions

```bash
pnpm --filter @swr/cli swr verify -a 0x1234567890123456789012345678901234567890 -e local -c 8453 -t contract
pnpm --filter @swr/cli swr verify -a 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -e local -c 8453 -t wallet
```

---

### Scenario 2: Limited Operator (Permission Boundary Test)

Operator B only has CONTRACT permission.

```bash
# Should succeed
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a \
  -o ./output

# Should fail
pnpm --filter @swr/cli swr submit-wallets \
  -f test/fixtures/wallets.json \
  -e local \
  -k 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

---

### Scenario 3: Unapproved User (Should Fail)

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  -k 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
```

---

### Scenario 4: DAO / Multisig Workflow (`--build-only`)

Generate Safe-compatible calldata without a private key:

```bash
pnpm --filter @swr/cli swr submit-contracts \
  -f test/fixtures/contracts.json \
  -e local \
  --build-only \
  -o ./output
```

Use the generated JSON in Safe Transaction Builder.

---

## Input File Formats

### JSON (Wallets/Contracts)

```json
[
  { "address": "0x123...", "chainId": 8453 },
  { "address": "0xabc...", "chainId": "eip155:1" },
  { "address": "0xdef..." }
]
```

### CSV (Wallets/Contracts)

```csv
address,chainId
0x123...,8453
0xabc...,eip155:1
0xdef...
```

### JSON (Transactions)

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

---

## Notes

- `verify` supports `wallet` and `contract` registry types.
- Operator permissions are enforced on-chain by `OperatorRegistry`.

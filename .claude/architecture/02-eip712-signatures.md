# EIP-712 Signature System

Security-critical two-phase signature system preventing phishing attacks.

---

## Two-Phase Defense

**Why two signatures?** Single-signature phishing is trivial:

```text
Attacker tricks victim → victim signs → wallet registered as stolen
```

With two phases:

1. Victim signs ACK → grace period starts (1-4 min)
2. Attacker needs SECOND signature → victim notices two wallet prompts

---

## Shared Domain

**All contracts** (WalletRegistry, TransactionRegistry, SpokeRegistry) use the **same** EIP-712 domain:

```typescript
domain: {
  name: 'StolenWalletRegistry',
  version: '4',
  chainId: <chain>,
  verifyingContract: <contract address>,
}
```

Cross-contract replay is prevented by **distinct typehashes** (different `primaryType` names), NOT by domain separation. The `verifyingContract` field also binds signatures to a specific contract deployment.

---

## Wallet Registry Types

```typescript
// packages/signatures/src/eip712/types.ts

export const WALLET_EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'statement', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'trustedForwarder', type: 'address' },
    { name: 'reportedChainId', type: 'uint64' },
    { name: 'incidentTimestamp', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Registration: [
    { name: 'statement', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'trustedForwarder', type: 'address' },
    { name: 'reportedChainId', type: 'uint64' },
    { name: 'incidentTimestamp', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
```

**Field mapping:** The EIP-712 field `wallet` maps to the contract parameter `registeree`. Same value, different naming context.

ACK and REG have **identical structure** but different `primaryType`, generating distinct hashes.

### TypeScript Message Interface

```typescript
export interface AcknowledgementMessage {
  statement: string;
  wallet: Address; // The stolen wallet being registered
  trustedForwarder: Address; // Who can call register()
  reportedChainId: bigint; // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint; // Unix timestamp (uint64), 0 if unknown
  nonce: bigint;
  deadline: bigint; // Signature expiry (block.timestamp)
}

// RegistrationMessage has identical shape
```

---

## Transaction Registry Types

```typescript
export const TX_EIP712_TYPES = {
  TransactionBatchAcknowledgement: [
    { name: 'statement', type: 'string' },
    { name: 'reporter', type: 'address' },
    { name: 'trustedForwarder', type: 'address' },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TransactionBatchRegistration: [
    { name: 'statement', type: 'string' },
    { name: 'reporter', type: 'address' },
    { name: 'trustedForwarder', type: 'address' },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
```

### Key Differences from Wallet Types

| Aspect          | Wallet Registry              | Transaction Registry                              |
| --------------- | ---------------------------- | ------------------------------------------------- |
| Primary types   | `AcknowledgementOfRegistry`  | `TransactionBatchAcknowledgement`                 |
|                 | `Registration`               | `TransactionBatchRegistration`                    |
| Key field       | `wallet` (address)           | `reporter` (address)                              |
| Chain ID format | `reportedChainId: uint64`    | `reportedChainId: bytes32` (CAIP hash)            |
| Extra fields    | `incidentTimestamp` (uint64) | `dataHash` (bytes32), `transactionCount` (uint32) |

---

## Signature Generation

1. **Get deadline from contract:**

```typescript
const { data } = useReadContract({
  functionName: 'generateHashStruct',
  args: [forwarderAddress, SIGNATURE_STEP.ACKNOWLEDGEMENT],
});
// Returns: [deadline, hashStruct]
```

2. **Build typed data & sign:**

```typescript
const typedData = buildAcknowledgementTypedData(chainId, contractAddress, {
  wallet: registeree,
  trustedForwarder: forwarder,
  reportedChainId,
  incidentTimestamp,
  nonce,
  deadline,
});
const signature = await signTypedDataAsync(typedData);
```

Builders inject the correct statement string to match contract constants from `EIP712Constants.sol`.

---

## Signature Storage

### Wallet Signatures

```typescript
// apps/web/src/lib/signatures/storage.ts

export interface StoredSignature {
  signature: Hex;
  deadline: bigint;
  nonce: bigint;
  address: Address;
  chainId: number;
  step: SignatureStep; // ACK (1) or REG (2)
  storedAt: number; // For 30-min TTL
}

// Storage key: swr_sig_${address}_${chainId}_${step}
```

### Transaction Batch Signatures

```typescript
// apps/web/src/lib/signatures/transactions/storage.ts

// Storage key: swr_tx_sig_${dataHash}_${chainId}_${step}
```

Uses `dataHash` (the keccak commitment of txHashes + chainIds), not a merkle root.

---

## Contract Functions

### Wallet Registry (hub + spoke identical)

```typescript
// apps/web/src/hooks/useAcknowledgement.ts

writeContractAsync({
  functionName: 'acknowledge',
  args: [
    registeree, // address - wallet being registered
    trustedForwarder, // address - who can call register()
    reportedChainId, // uint64 - raw EVM chain ID
    incidentTimestamp, // uint64 - unix timestamp
    deadline, // uint256 - signature expiry (timestamp)
    nonce, // uint256 - must match on-chain nonces[registeree]
    v,
    r,
    s, // signature components
  ],
});

// apps/web/src/hooks/useRegistration.ts

writeContractAsync({
  functionName: 'register',
  args: [
    registeree, // address
    trustedForwarder, // address - must match ack phase AND msg.sender
    reportedChainId, // uint64
    incidentTimestamp, // uint64
    deadline, // uint256
    nonce, // uint256
    v,
    r,
    s,
  ],
});
```

### Contract Verification (Solidity)

```solidity
// WalletRegistry.sol — acknowledge()
bytes32 digest = _hashTypedDataV4(structHash);
address recoveredWallet = ECDSA.recover(digest, v, r, s);
if (recoveredWallet != registeree) revert WalletRegistry__InvalidSignature();
if (nonce != nonces[registeree]) revert WalletRegistry__InvalidNonce();
nonces[registeree]++;

// WalletRegistry.sol — register()
if (ack.forwarder != msg.sender) revert WalletRegistry__InvalidForwarder();
if (block.number < ack.gracePeriodStart) revert WalletRegistry__GracePeriodNotStarted();
if (block.number > ack.deadline) revert WalletRegistry__DeadlineExpired();
```

---

## Flow by Method

**Standard:** User signs both, pays both

```text
Sign ACK → Pay ACK → Grace Period → Sign REG → Pay REG
```

**Self-Relay:** Sign with stolen, pay with gas wallet

```text
Sign ACK (stolen) → Switch → Pay ACK (gas) → Grace → Sign REG (stolen) → Pay REG (gas)
```

**P2P Relay:** Sign with stolen, helper pays

```text
Sign ACK → Send via P2P → Helper pays → Grace → Sign REG → Send via P2P → Helper pays
```

---

## Nonce Mechanics

```text
Initial: nonces[0x123] = 0

ACK tx: Contract verifies nonce=0 ✓, increments to 1
        Signature with nonce=0 now INVALID forever

REG tx: Contract verifies nonce=1 ✓, increments to 2
        Signature with nonce=1 now INVALID forever
```

The nonce is passed as an **explicit parameter** to `acknowledge()` and `register()`. If it doesn't match the on-chain value, the contract reverts with `WalletRegistry__InvalidNonce` **before** signature verification (fail-fast pattern).

---

## Dual Deadline System

Two different deadline concepts in the wallet flow:

| Deadline                       | Unit                          | Purpose                                               |
| ------------------------------ | ----------------------------- | ----------------------------------------------------- |
| `deadline` param               | Timestamp (`block.timestamp`) | EIP-712 signature expiry -- prevents stale signatures |
| `AcknowledgementData.deadline` | Block number (`block.number`) | Grace period window -- enforces registration timing   |

---

## Grace Period

Contract uses `block.prevrandao` for randomization. Actual durations depend on chain-specific timing config (see `TimingConfig.sol`). Typically 1-4 minutes.

---

## Security Properties

| Property          | Mechanism                                               |
| ----------------- | ------------------------------------------------------- |
| Chain-binding     | Domain includes `chainId`                               |
| Contract-binding  | Domain includes `verifyingContract`                     |
| Phase separation  | Different `primaryType`                                 |
| Replay prevention | Nonce increments (fail-fast on mismatch)                |
| Time expiration   | `deadline` checked against `block.timestamp`            |
| Grace period      | 1-4 min randomized delay                                |
| Client TTL        | 30-min sessionStorage expiration (cleared on tab close) |

---

## Statements (Displayed to Users)

From `EIP712Constants.sol`:

- **Wallet ACK:** "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry."
- **Wallet REG:** "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible."
- **Tx ACK:** "This signature acknowledges the intent to report stolen transactions to the Stolen Wallet Registry."
- **Tx REG:** "This signature confirms permanent registration of stolen transactions in the Stolen Wallet Registry. This action is irreversible."

---

## Key Files

```text
packages/signatures/src/
├── eip712/
│   ├── types.ts          # All EIP-712 type definitions
│   ├── builders.ts       # buildAcknowledgementTypedData, buildRegistrationTypedData
│   └── constants.ts      # Domain name, version
apps/web/src/lib/signatures/
├── eip712.ts             # Re-exports from @swr/signatures
├── storage.ts            # Wallet signature sessionStorage
├── transactions/
│   └── storage.ts        # Tx batch signature sessionStorage (key: dataHash)
└── utils.ts              # Parsing, validation
packages/contracts/src/libraries/
└── EIP712Constants.sol   # Solidity statement strings
```

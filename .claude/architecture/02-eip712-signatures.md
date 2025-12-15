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

## Type Definitions

```typescript
// apps/web/src/lib/signatures/eip712.ts

export const EIP712_DOMAIN_NAME = 'StolenWalletRegistry';
export const EIP712_DOMAIN_VERSION = '4';

export const EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Registration: [
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;
```

**Critical:** ACK and REG have identical structure but different `primaryType`, generating distinct hashes.

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
  owner,
  forwarder,
  nonce,
  deadline,
});
const signature = await signTypedDataAsync(typedData);
```

---

## Signature Storage

```typescript
// apps/web/src/lib/signatures/storage.ts

export interface StoredSignature {
  signature: `0x${string}`;
  deadline: bigint;
  nonce: bigint;
  address: `0x${string}`;
  chainId: number;
  step: SignatureStep; // ACK (1) or REG (2)
  storedAt: number; // For 30-min TTL
}

// Storage key: swr_sig_${address}_${chainId}_${step}
```

---

## Contract Verification

```solidity
// Acknowledgement
bytes32 digest = _hashTypedDataV4(structHash);
address recoveredWallet = ECDSA.recover(digest, v, r, s);
if (recoveredWallet != owner) revert InvalidSigner();
nonces[owner]++;  // Replay prevention

// Registration (also checks)
if (tf.forwarder != msg.sender) revert InvalidForwarder();
if (block.number < tf.startBlock) revert GracePeriodNotStarted();
if (block.number > tf.expiryBlock) revert WindowExpired();
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

---

## Grace Period

Contract uses `block.prevrandao` for randomization:

- Start: ~1-2 minutes from ACK (4-8 blocks)
- Window: ~4-13 minutes total (55-110 blocks)

---

## Security Properties

| Property          | Mechanism                                               |
| ----------------- | ------------------------------------------------------- |
| Chain-binding     | Domain includes `chainId`                               |
| Contract-binding  | Domain includes `verifyingContract`                     |
| Phase separation  | Different `primaryType`                                 |
| Replay prevention | Nonce increments                                        |
| Time expiration   | `deadline` checked                                      |
| Grace period      | 1-4 min randomized delay                                |
| Client TTL        | 30-min sessionStorage expiration (cleared on tab close) |

---

## Key Files

```text
apps/web/src/lib/signatures/
├── eip712.ts    # Type definitions, builders
├── storage.ts   # sessionStorage persistence
└── utils.ts     # Parsing, validation
```

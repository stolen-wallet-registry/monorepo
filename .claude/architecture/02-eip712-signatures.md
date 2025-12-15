# EIP-712 Signature System

This document describes the security-critical two-phase EIP-712 signature system that prevents phishing attacks during wallet registration.

---

## Overview: Two-Phase Registration

The system requires **two separate signatures** to complete registration:

1. **Acknowledgement (ACK)** - User signs intent to register, establishes grace period
2. **Registration (REG)** - User signs final registration within randomized time window

This two-phase pattern is the **primary anti-phishing defense**:

- If an attacker tricks a user into signing ACK, they still need a second signature
- The grace period gives users time to notice suspicious activity
- Two separate wallet prompts are harder to miss than one

---

## Why Two Phases? (Attack Prevention)

### Single-Signature Attack Vector

Without two phases, an attacker could:

```
1. Send victim link: "Click to authorize wallet recovery"
2. Behind scenes: victim signs wallet registration
3. Victim unknowingly registered their wallet as stolen
4. No time for victim to notice or cancel
```

### Two-Phase Defense

With the current system:

```
1. Attacker tricks victim into signing ACK
   → Contract sets randomized grace period (1-4 min)
   → Victim's wallet shows "Acknowledgement" message

2. Grace Period (1-4 minutes)
   → Asymmetric time window
   → Legitimate users prepare for registration
   → Suspicious users notice the initial signature

3. Attacker needs SECOND signature
   → Victim would see two separate wallet prompts
   → Both prompts show identical message structure
   → Much harder to phish successfully
```

---

## EIP-712 Type Definitions

### File: `apps/web/src/lib/signatures/eip712.ts`

```typescript
// Domain configuration - MUST match contract exactly
export const EIP712_DOMAIN_NAME = 'StolenWalletRegistry';
export const EIP712_DOMAIN_VERSION = '4';

// Type definitions (ACK and REG have identical structure)
export const EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'owner', type: 'address' }, // User's stolen wallet
    { name: 'forwarder', type: 'address' }, // Who can submit tx
    { name: 'nonce', type: 'uint256' }, // Replay prevention
    { name: 'deadline', type: 'uint256' }, // Time limit
  ],
  Registration: [
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// Pre-computed type hashes (keccak256 of type definition)
export const TYPE_HASHES = {
  ACKNOWLEDGEMENT: '0x5d29f5466c65723821dcc0b8c03d313c167487cda1efe0d5381d304f61bb85d2',
  REGISTRATION: '0x84a9e85d406e54d479a4c4f1ec22065370770f384a4b1e9f49d3dcf5ab26ad49',
} as const;
```

**Critical Detail:** Both signature types use identical message structure. The **only difference** is the `primaryType` field:

- ACK: `primaryType: 'AcknowledgementOfRegistry'`
- REG: `primaryType: 'Registration'`

This ensures different hashes are generated, preventing signature reuse between phases.

---

## Domain Separator

The EIP-712 domain binds signatures to a specific contract and chain:

```typescript
interface EIP712Domain {
  name: string; // 'StolenWalletRegistry'
  version: string; // '4'
  chainId: bigint; // Chain-specific (prevents cross-chain replay)
  verifyingContract: `0x${string}`; // Contract address
}

function buildDomain(chainId: number, contractAddress: `0x${string}`): EIP712Domain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract: contractAddress,
  };
}
```

**Security properties:**

- `chainId` prevents using signatures from one chain on another
- `verifyingContract` prevents using signatures on wrong contract
- `name` and `version` must match contract constants exactly

---

## Signature Generation Lifecycle

### Step 1: Get Deadline from Contract

**File:** `apps/web/src/hooks/useGenerateHashStruct.ts`

Before signing, fetch a fresh deadline from the contract:

```typescript
export function useAcknowledgementHashStruct(forwarderAddress: Address | undefined) {
  const contractAddress = getContractAddress(chainId);

  return useReadContract({
    address: contractAddress,
    abi: stolenWalletRegistryABI,
    functionName: 'generateHashStruct',
    args: [forwarderAddress, SIGNATURE_STEP.ACKNOWLEDGEMENT],
    query: {
      enabled: !!forwarderAddress && isAddress(forwarderAddress),
    },
  });
}
```

The contract returns:

```solidity
function generateHashStruct(address forwarder, uint8 step)
  public view returns (uint256 deadline, bytes32 hashStruct)
{
  uint256 deadline = CommonUtils._getDeadline();  // Randomized
  uint256 nonce = nonces[msg.sender];

  bytes32 typehash = step == 1
    ? ACKNOWLEDGEMENT_TYPEHASH
    : REGISTRATION_TYPEHASH;

  bytes32 hashStruct = keccak256(abi.encode(
    typehash,
    msg.sender,   // owner
    forwarder,
    nonce,
    deadline
  ));

  return (deadline, hashStruct);
}
```

### Step 2: Build EIP-712 Typed Data

**File:** `apps/web/src/lib/signatures/eip712.ts`

```typescript
export interface AcknowledgementMessage {
  owner: Address;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

export function buildAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  message: AcknowledgementMessage
): TypedData {
  return {
    domain: buildDomain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'AcknowledgementOfRegistry' as const,
    message: {
      owner: message.owner,
      forwarder: message.forwarder,
      nonce: message.nonce,
      deadline: message.deadline,
    },
  };
}

export function buildRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  message: AcknowledgementMessage // Same structure
): TypedData {
  return {
    domain: buildDomain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'Registration' as const, // Different primaryType!
    message: {
      owner: message.owner,
      forwarder: message.forwarder,
      nonce: message.nonce,
      deadline: message.deadline,
    },
  };
}
```

### Step 3: Sign with Wallet

**File:** `apps/web/src/hooks/useSignEIP712.ts`

```typescript
export function useSignEIP712() {
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);

  const signAcknowledgement = useCallback(
    async (params: SignParams): Promise<`0x${string}`> => {
      const typedData = buildAcknowledgementTypedData(chainId, contractAddress, {
        owner: params.owner,
        forwarder: params.forwarder,
        nonce: params.nonce,
        deadline: params.deadline,
      });

      logger.signature.info('Signing acknowledgement', {
        owner: params.owner,
        forwarder: params.forwarder,
        deadline: params.deadline.toString(),
      });

      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      logger.signature.info('Acknowledgement signed', {
        signatureLength: signature.length,
      });

      return signature;
    },
    [chainId, contractAddress, signTypedDataAsync]
  );

  // Similar for signRegistration...

  return { signAcknowledgement, signRegistration };
}
```

The wallet (MetaMask, etc.) performs the actual signing:

1. Hashes the domain separator
2. Hashes the typed data struct
3. Combines to create the EIP-712 digest
4. Signs with user's private key
5. Returns `0x` + 65 bytes (v, r, s)

---

## Signature Storage

### File: `apps/web/src/lib/signatures/storage.ts`

Signatures are stored in **localStorage** with a 30-minute TTL:

```typescript
export interface StoredSignature {
  signature: `0x${string}`; // Full 65-byte signature (132 hex chars)
  deadline: bigint; // Block timestamp deadline
  nonce: bigint; // Incremental counter
  address: `0x${string}`; // Registeree address
  chainId: number; // Chain ID
  step: SignatureStep; // ACK (1) or REG (2)
  storedAt: number; // Timestamp for TTL check
}

export enum SIGNATURE_STEP {
  ACKNOWLEDGEMENT = 1,
  REGISTRATION = 2,
}

// Storage key format
function getStorageKey(address: Address, chainId: number, step: SignatureStep): string {
  return `swr_sig_${address.toLowerCase()}_${chainId}_${step}`;
}
// Example: swr_sig_0xd8da6bf26964af9d7eed9e03e53415d37aa96045_1_1
```

### Store a Signature

```typescript
export function storeSignature(data: StoredSignature): void {
  const key = getStorageKey(data.address, data.chainId, data.step);

  const serializable = {
    ...data,
    deadline: data.deadline.toString(),
    nonce: data.nonce.toString(),
    storedAt: Date.now(),
  };

  localStorage.setItem(key, JSON.stringify(serializable));

  logger.signature.debug('Stored signature', {
    address: data.address,
    chainId: data.chainId,
    step: data.step,
  });
}
```

### Retrieve a Signature

```typescript
const SIGNATURE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getSignature(
  address: Address,
  chainId: number,
  step: SignatureStep
): StoredSignature | null {
  const key = getStorageKey(address, chainId, step);
  const raw = localStorage.getItem(key);

  if (!raw) return null;

  const parsed = JSON.parse(raw);

  // TTL check
  if (Date.now() - parsed.storedAt > SIGNATURE_TTL_MS) {
    localStorage.removeItem(key);
    logger.signature.warn('Signature expired (client TTL)', { address, step });
    return null;
  }

  return {
    ...parsed,
    deadline: BigInt(parsed.deadline),
    nonce: BigInt(parsed.nonce),
  };
}
```

### Clear Signatures

```typescript
export function clearSignature(address: Address, chainId: number, step: SignatureStep): void {
  const key = getStorageKey(address, chainId, step);
  localStorage.removeItem(key);
}

export function clearAllSignatures(address: Address, chainId: number): void {
  clearSignature(address, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);
  clearSignature(address, chainId, SIGNATURE_STEP.REGISTRATION);
}
```

**Security features:**

- **localStorage only** - Not session-sensitive, persists for retry
- **Lowercase address** - Normalized to prevent cache misses
- **30-minute TTL** - Client-side expiration beyond contract deadline
- **Step separation** - ACK and REG stored separately

---

## Signature Parsing & Validation

### File: `apps/web/src/lib/signatures/utils.ts`

Signatures are 65 bytes (130 hex chars + "0x"):

```typescript
export function isValidSignatureFormat(signature: unknown): signature is `0x${string}` {
  if (typeof signature !== 'string') return false;
  if (!signature.startsWith('0x')) return false;
  if (signature.length !== 132) return false; // 0x + 130 hex
  return /^0x[0-9a-fA-F]{130}$/.test(signature);
}

export interface ParsedSignature {
  v: number; // 27 or 28
  r: `0x${string}`; // 32 bytes
  s: `0x${string}`; // 32 bytes
}

export function parseSignature(signature: `0x${string}`): ParsedSignature {
  // viem provides this utility
  const { v, r, s } = hexToSignature(signature);
  return {
    v: Number(v),
    r: r,
    s: s,
  };
}
```

### Expiration Check

```typescript
export function isSignatureExpired(deadline: bigint, currentBlock: bigint): boolean {
  return currentBlock >= deadline;
}

export function isWithinRegistrationWindow(
  startBlock: bigint,
  deadlineBlock: bigint,
  currentBlock: bigint
): boolean {
  return currentBlock >= startBlock && currentBlock < deadlineBlock;
}
```

---

## Signature Flow by Registration Method

### Standard Registration (User = Owner = Forwarder)

```
User's Wallet (0x123)
    │
    ├─ 1. Call generateHashStruct(0x123, ACK)
    │      → Returns deadline, nonce from contract
    │
    ├─ 2. Build typed data: owner=0x123, forwarder=0x123
    │
    ├─ 3. Sign ACK (wallet prompt)
    │      → Signature stored locally
    │
    ├─ 4. Submit ACK tx: acknowledgementOfRegistry()
    │      → Contract validates signature
    │      → Nonce incremented to 1
    │      → Grace period starts
    │
    ├─ 5. Wait 1-4 minutes (grace period)
    │
    ├─ 6. Call generateHashStruct(0x123, REG)
    │      → New deadline, nonce=1
    │
    ├─ 7. Build typed data: owner=0x123, forwarder=0x123, nonce=1
    │
    ├─ 8. Sign REG (wallet prompt - SECOND signature)
    │      → Signature stored locally
    │
    └─ 9. Submit REG tx: walletRegistration()
           → Contract validates signature
           → Wallet registered!
```

### Self-Relay Registration (Sign from A, Pay from B)

```
Stolen Wallet (0x123)              Funded Wallet (0x456)
        │                                  │
        ├─ 1. Build typed data:            │
        │      owner=0x123                 │
        │      forwarder=0x456             │
        │                                  │
        ├─ 2. Sign ACK ───────────────────→│
        │      (signature stored)          │
        │                                  ├─ 3. Retrieve signature
        │                                  │
        │                                  ├─ 4. Submit ACK tx
        │                                  │      (msg.sender=0x456)
        │                                  │      (signature from 0x123)
        │                                  │
        │          (grace period)          │
        │                                  │
        ├─ 5. Sign REG ───────────────────→│
        │      (signature stored)          │
        │                                  ├─ 6. Retrieve signature
        │                                  │
        │                                  └─ 7. Submit REG tx
        │                                        (0x123 registered!)
```

### P2P Relay Registration

```
Registeree (0x123)                    Relayer
    │                                     │
    ├─ 1. Sign ACK                        │
    │      owner=0x123                    │
    │      forwarder=relayer_address      │
    │                                     │
    ├─ 2. Send via P2P ──────────────────→│
    │      /swr/acknowledgement/sig/1.0.0 │
    │                                     ├─ 3. Validate signature
    │                                     │      (isValidSignature)
    │                                     │
    │                                     ├─ 4. Store in localStorage
    │                                     │
    │                                     ├─ 5. Submit ACK tx
    │                                     │
    │←───────────────────────────────────├─ 6. Send tx hash via P2P
    │      /swr/acknowledgement/pay/1.0.0 │
    │                                     │
    │          (grace period)             │
    │                                     │
    ├─ 7. Sign REG                        │
    │                                     │
    ├─ 8. Send via P2P ──────────────────→│
    │      /swr/register/sig/1.0.0        │
    │                                     ├─ 9. Validate, store
    │                                     │
    │                                     ├─ 10. Submit REG tx
    │                                     │
    │←───────────────────────────────────└─ 11. Send tx hash
           /swr/register/pay/1.0.0
```

---

## Contract Verification

### Acknowledgement Verification

```solidity
function acknowledgementOfRegistry(
    uint256 deadline,
    uint256 nonce,
    address owner,
    uint8 v,
    bytes32 r,
    bytes32 s
) external {
    // 1. Check deadline
    if (block.timestamp > deadline) {
        revert Acknowlegement__DeadlineExpired();
    }

    // 2. Check nonce
    if (nonce != nonces[owner]) {
        revert Acknowlegement__InvalidNonce();
    }

    // 3. Recover signer from signature
    bytes32 structHash = keccak256(abi.encode(
        ACKNOWLEDGEMENT_TYPEHASH,
        owner,
        msg.sender,  // forwarder
        nonce,
        deadline
    ));

    bytes32 digest = _hashTypedDataV4(structHash);
    address recoveredWallet = ECDSA.recover(digest, v, r, s);

    // 4. Verify signer is owner
    if (recoveredWallet != owner) {
        revert Acknowlegement__InvalidSigner();
    }

    // 5. Increment nonce (replay prevention)
    nonces[owner]++;

    // 6. Store forwarder info with grace period
    trustedForwarders[owner] = TrustedForwarder({
        forwarder: msg.sender,
        startBlock: CommonUtils._getGracePeriodStart(),
        expiryBlock: CommonUtils._getGracePeriodDeadline()
    });

    emit AcknowledgementEvent(owner, msg.sender);
}
```

### Registration Verification

```solidity
function walletRegistration(
    uint256 deadline,
    uint256 nonce,
    address owner,
    uint8 v,
    bytes32 r,
    bytes32 s
) external {
    // 1. Verify forwarder from ACK phase
    TrustedForwarder memory tf = trustedForwarders[owner];
    if (tf.forwarder != msg.sender) {
        revert Registration__InvalidForwarder();
    }

    // 2. Check within registration window
    if (block.number < tf.startBlock) {
        revert Registration__GracePeriodNotStarted();
    }
    if (block.number > tf.expiryBlock) {
        revert Registration__WindowExpired();
    }

    // 3. Check deadline
    if (block.timestamp > deadline) {
        revert Registration__DeadlineExpired();
    }

    // 4. Check nonce
    if (nonce != nonces[owner]) {
        revert Registration__InvalidNonce();
    }

    // 5. Recover and verify signer
    bytes32 structHash = keccak256(abi.encode(
        REGISTRATION_TYPEHASH,  // Different from ACK!
        owner,
        msg.sender,
        nonce,
        deadline
    ));

    bytes32 digest = _hashTypedDataV4(structHash);
    address recoveredWallet = ECDSA.recover(digest, v, r, s);

    if (recoveredWallet != owner) {
        revert Registration__InvalidSigner();
    }

    // 6. Increment nonce
    nonces[owner]++;

    // 7. Delete forwarder (single-use)
    delete trustedForwarders[owner];

    // 8. Register wallet
    registeredWallets[owner] = true;

    emit RegistrationEvent(owner);
}
```

---

## Nonce Mechanics (Replay Prevention)

The nonce counter prevents signature reuse:

```
Initial state: nonces[0x123] = 0

Transaction 1 (ACK): Sign with nonce=0
    → Contract verifies nonce matches (0 == 0) ✓
    → Contract increments: nonces[0x123] = 1
    → Signature with nonce=0 now INVALID forever

Transaction 2 (REG): Sign with nonce=1
    → Contract verifies nonce matches (1 == 1) ✓
    → Contract increments: nonces[0x123] = 2
    → Signature with nonce=1 now INVALID forever

Next registration attempt: Must use nonce=2
    → Old signatures (nonce 0 and 1) permanently invalid
```

**Reading nonce from contract:**

```typescript
// File: apps/web/src/hooks/useContractNonce.ts
export function useContractNonce(address: Address | undefined) {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);

  return useReadContract({
    address: contractAddress,
    abi: stolenWalletRegistryABI,
    functionName: 'nonces',
    args: [address],
    query: {
      enabled: !!address && isAddress(address),
    },
  });
}
```

---

## Grace Period Randomization

### File: Contract `CommonUtils.sol`

The contract uses `block.prevrandao` for randomization:

```solidity
// Constants
uint256 constant START_TIME_BLOCKS = 4;    // ~1 minute (4 * 15s)
uint256 constant DEADLINE_BLOCKS = 55;      // ~13.75 minutes

function _getGracePeriodStart() internal view returns (uint256) {
    // Random 4-8 blocks from now
    return block.number + _getRandomBlock(4);
}

function _getGracePeriodDeadline() internal view returns (uint256) {
    // Random 55-110 blocks from now
    return block.number + _getRandomBlock(55);
}

function _getRandomBlock(uint256 minBlocks) private view returns (uint256) {
    // Hash of prevrandao + timestamp gives randomness
    uint256 randomness = uint256(keccak256(
        abi.encodePacked(block.prevrandao, block.timestamp)
    ));
    return (randomness % 55) + minBlocks;
}
```

### Timeline Example

```
Block 100: User signs ACK
    │
    ├─ startBlock = 100 + random(4-8) = ~104-108
    └─ expiryBlock = 100 + random(55-110) = ~155-210

Block 104-108: Grace period begins
    │
    └─ Registration window opens

Block 108-155: Registration allowed
    │
    └─ User can sign and submit REG

Block 155-210: Window closes
    │
    └─ Too late to register, signature expired
```

---

## Security Properties Summary

| Property               | Mechanism                              | Why It Matters                             |
| ---------------------- | -------------------------------------- | ------------------------------------------ |
| **Chain-binding**      | Domain includes `chainId`              | Prevents cross-chain replay                |
| **Contract-binding**   | Domain includes `verifyingContract`    | Prevents wrong contract replay             |
| **Phase separation**   | Different `primaryType` for ACK vs REG | Prevents phase confusion                   |
| **Replay prevention**  | Nonce increments per signature         | Prevents signature reuse                   |
| **Time expiration**    | `deadline` field checked by contract   | Prevents stale signatures                  |
| **Grace period**       | Randomized 1-4 min delay               | Gives victim detection time                |
| **One-time forwarder** | Deleted after successful REG           | Prevents registration by different relayer |
| **Client TTL**         | 30-minute localStorage expiration      | Prevents accidental stale usage            |

---

## Type Hash Computation

Type hashes are keccak256 of the type definition string:

```solidity
// Contract constants
bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH = keccak256(
    "AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)"
);
// = 0x5d29f5466c65723821dcc0b8c03d313c167487cda1efe0d5381d304f61bb85d2

bytes32 private constant REGISTRATION_TYPEHASH = keccak256(
    "Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)"
);
// = 0x84a9e85d406e54d479a4c4f1ec22065370770f384a4b1e9f49d3dcf5ab26ad49
```

**Frontend verification:**

```typescript
// File: apps/web/src/lib/signatures/eip712.test.ts
it('type hashes match contract constants', () => {
  const ackTypeString =
    'AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)';
  const regTypeString =
    'Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)';

  expect(keccak256(toBytes(ackTypeString))).toBe(TYPE_HASHES.ACKNOWLEDGEMENT);
  expect(keccak256(toBytes(regTypeString))).toBe(TYPE_HASHES.REGISTRATION);
});
```

Any mismatch between frontend and contract type definitions causes signature verification to fail.

---

## Key Files Reference

| File                                          | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `apps/web/src/lib/signatures/eip712.ts`       | Type definitions, domain builder, typed data builders |
| `apps/web/src/lib/signatures/storage.ts`      | localStorage persistence, TTL expiration              |
| `apps/web/src/lib/signatures/utils.ts`        | Signature parsing, format validation                  |
| `apps/web/src/hooks/useSignEIP712.ts`         | wagmi wrapper for signing                             |
| `apps/web/src/hooks/useGenerateHashStruct.ts` | Contract read for deadline/nonce                      |
| `apps/web/src/hooks/useContractNonce.ts`      | Read current nonce                                    |
| Contract: `StolenWalletRegistry.sol`          | Signature verification, nonce management              |
| Contract: `CommonUtils.sol`                   | Grace period randomization                            |

---

## Common Issues & Solutions

### "Invalid Signer" Error

**Cause:** Signature was signed by wrong address
**Solution:** Ensure wallet is switched to `registeree` before signing

### "Deadline Expired" Error

**Cause:** Too much time passed between getting deadline and submitting
**Solution:** Re-fetch deadline from contract, sign again

### "Invalid Nonce" Error

**Cause:** Signature was signed with old nonce
**Solution:** Re-fetch nonce from contract, sign again

### Signature Not Found in localStorage

**Cause:** 30-minute TTL expired
**Solution:** Sign again (signatures are cheap, just gas-less signing)

### Cross-Chain Signature Failure

**Cause:** Signature was generated for different chain
**Solution:** Ensure chainId in typed data matches current chain

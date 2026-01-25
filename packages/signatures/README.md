# @swr/signatures

EIP-712 typed-data helpers for wallet and transaction registration flows.

## What This Covers

- Typed data builders for ACK/REG signatures
- Shared domain constants
- Signature parsing + validation helpers

## Wallet Signatures

```ts
import { buildAcknowledgementTypedData, buildRegistrationTypedData } from '@swr/signatures';

const typedAck = buildAcknowledgementTypedData(chainId, contractAddress, {
  owner: '0x...',
  forwarder: '0x...',
  nonce: 0n,
  deadline: 0n,
});

const typedReg = buildRegistrationTypedData(chainId, contractAddress, {
  owner: '0x...',
  forwarder: '0x...',
  nonce: 1n,
  deadline: 0n,
});
```

## Transaction Signatures

```ts
import { buildTxAcknowledgementTypedData, buildTxRegistrationTypedData } from '@swr/signatures';

const typedAck = buildTxAcknowledgementTypedData(chainId, contractAddress, {
  merkleRoot: '0x...',
  reportedChainId: '0x...',
  transactionCount: 10,
  forwarder: '0x...',
  nonce: 0n,
  deadline: 0n,
});

const typedReg = buildTxRegistrationTypedData(chainId, contractAddress, {
  merkleRoot: '0x...',
  reportedChainId: '0x...',
  forwarder: '0x...',
  nonce: 1n,
  deadline: 0n,
});
```

Statements are injected by the builders to match contract constants. Use `STATEMENTS` only if you need to display the exact text in UI.

## Validation Helpers

```ts
import { parseSignature, isValidSignatureFormat } from '@swr/signatures';

if (isValidSignatureFormat(signature)) {
  const { v, r, s } = parseSignature(signature);
}
```

## Exports

- Domains: `EIP712_DOMAIN_NAME`, `EIP712_DOMAIN_VERSION`, `getEIP712Domain`
- Wallet types: `EIP712_TYPES`, `TYPE_HASHES`, `SIGNATURE_STEP`
- Transaction types: `TX_EIP712_TYPES`, `TX_TYPE_HASHES`, `TX_SIGNATURE_STEP`
- Builders: `buildAcknowledgementTypedData`, `buildRegistrationTypedData`, `buildTxAcknowledgementTypedData`, `buildTxRegistrationTypedData`
- Validation: `parseSignature`, `isSignatureExpired`, `isWithinRegistrationWindow`, `isValidSignatureFormat`

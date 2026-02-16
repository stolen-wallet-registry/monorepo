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
  trustedForwarder: '0x...',
  nonce: 0n,
  deadline: 0n,
});

const typedReg = buildRegistrationTypedData(chainId, contractAddress, {
  owner: '0x...',
  trustedForwarder: '0x...',
  nonce: 1n,
  deadline: 0n,
});
```

## Transaction Signatures

`dataHash` is a commitment to the batch contents: `keccak256(abi.encode(txHashes, chainIds))` where `txHashes` and `chainIds` are the `bytes32[]` arrays submitted in the batch. This binds the signer's approval to a specific set of transactions, preventing the relayer from substituting different data after signing.

```ts
import { buildTxAcknowledgementTypedData, buildTxRegistrationTypedData } from '@swr/signatures';

const typedAck = buildTxAcknowledgementTypedData(chainId, contractAddress, {
  dataHash: '0x...', // keccak256(abi.encode(txHashes, chainIds))
  reportedChainId: '0x...',
  transactionCount: 10,
  trustedForwarder: '0x...',
  nonce: 0n,
  deadline: 0n,
});

const typedReg = buildTxRegistrationTypedData(chainId, contractAddress, {
  dataHash: '0x...', // keccak256(abi.encode(txHashes, chainIds))
  reportedChainId: '0x...',
  trustedForwarder: '0x...',
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
- Statements: `STATEMENTS` (acknowledgement and registration statement text)
- Builders: `buildAcknowledgementTypedData`, `buildRegistrationTypedData`, `buildTxAcknowledgementTypedData`, `buildTxRegistrationTypedData`
- Validation: `parseSignature`, `isSignatureExpired`, `isWithinRegistrationWindow`, `isValidSignatureFormat`

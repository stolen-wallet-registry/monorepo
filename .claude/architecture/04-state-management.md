# State Management

Zustand stores with immer, persist, and devtools middleware.

---

## Stores

| Store                             | Purpose                           | Persisted | Version |
| --------------------------------- | --------------------------------- | --------- | ------- |
| `useRegistrationStore`            | Wallet flow state, tx hashes      | Yes       | v2      |
| `useFormStore`                    | Wallet form values                | Yes       | v1      |
| `useTransactionRegistrationStore` | Transaction flow state            | Yes       | v1      |
| `useTransactionFormStore`         | Transaction selection + data hash | Partial   | v3      |
| `useP2PStore`                     | Connection state                  | Partial   | v1      |

---

## Middleware Pattern

```typescript
export const useExampleStore = create<State & Actions>()(
  devtools(
    persist(
      immer((set) => ({
        // state and actions
      })),
      { name: 'swr-example-state', version: 1, migrate: (persisted) => /* ... */ }
    ),
    { name: 'ExampleStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
```

Order matters: `devtools(persist(immer(...)))`

---

## Registration Store (v2)

```typescript
// apps/web/src/stores/registrationStore.ts

interface RegistrationState {
  registrationType: 'standard' | 'selfRelay' | 'p2pRelay';
  step: RegistrationStep | null;
  acknowledgementHash: Hash | null;
  acknowledgementChainId: number | null;
  registrationHash: Hash | null;
  registrationChainId: number | null;
  bridgeMessageId: Hash | null;
  reportedChainId: bigint | null;      // Added in v2
  incidentTimestamp: bigint | null;    // Added in v2
}

// Step sequences
export const STEP_SEQUENCES = {
  standard: ['acknowledge-and-sign', 'acknowledge-and-pay', 'grace-period', ...],
  selfRelay: ['acknowledge-and-sign', 'switch-and-pay-one', 'grace-period', ...],
  p2pRelay: ['wait-for-connection', 'acknowledge-and-sign', ...],
};
```

Persists with custom BigInt serialization. Migration v1→v2 adds `reportedChainId` and `incidentTimestamp` fields.

---

## Form Store (v1)

```typescript
// apps/web/src/stores/formStore.ts

interface FormState {
  registeree: Address | null;
  relayer: Address | null;
}
```

Migration validates addresses with `isAddress()`.

---

## Transaction Registration Store (v1)

```typescript
// apps/web/src/stores/transactionRegistrationStore.ts

interface TransactionRegistrationState {
  registrationType: 'standard' | 'selfRelay' | 'p2pRelay';
  step: TransactionRegistrationStep | null;
  acknowledgementHash: Hash | null;
  acknowledgementChainId: number | null;
  registrationHash: Hash | null;
  registrationChainId: number | null;
  bridgeMessageId: Hash | null;
}
```

---

## Transaction Form Store (v3)

```typescript
// apps/web/src/stores/transactionFormStore.ts

interface TransactionFormState {
  reporter: Address | null;
  forwarder: Address | null;
  selectedTxHashes: Hash[];
  selectedTxDetails: StoredTransactionDetail[];
  reportedChainId: number | null;
  dataHash: Hash | null; // Transient (not persisted)
  txHashesForContract: Hash[]; // Transient (not persisted)
  chainIdsForContract: Hash[]; // Transient (not persisted)
}
```

**Partial persistence:** Only `reporter`, `forwarder`, `selectedTxHashes`, `selectedTxDetails`, and `reportedChainId` are persisted via `partialize`. Derived fields (`dataHash`, `txHashesForContract`, `chainIdsForContract`) are transient and recomputed on use.

Migration v1→v3 clears derived fields (renamed from merkleRoot to dataHash).

---

## P2P Store (v1)

```typescript
// apps/web/src/stores/p2pStore.ts

interface P2PState {
  peerId: string | null; // Persists
  partnerPeerId: string | null; // Persists
  connectedToPeer: boolean; // Resets on reload
  connectionStatus: P2PConnectionStatus; // Resets on reload
  isInitialized: boolean; // Resets on reload
  errorMessage: string | null; // Resets on reload
}
```

Connection status and initialization are ephemeral -- libp2p needs re-initialization on each page load, so persisting these would be misleading.

---

## Selector Pattern

Use `useShallow` for optimized re-renders:

```typescript
// GOOD: Only re-renders when selected values change
const { step, setStep } = useRegistrationStore(
  useShallow((s) => ({ step: s.step, setStep: s.setStep }))
);

// Simple read-only
export const useRegisteree = () => useFormStore((s) => s.registeree);
```

---

## Cross-Store Reset

```typescript
// apps/web/src/hooks/useStepNavigation.ts

const resetFlow = () => {
  resetRegistration(); // registrationStore.reset()
  resetForm(); // formStore.reset()
  clearAllSignatures(); // sessionStorage signatures
};
```

---

## Storage Keys

| Store           | Key                                  | Version |
| --------------- | ------------------------------------ | ------- |
| Registration    | `swr-registration-state`             | 2       |
| Form            | `swr-form-state`                     | 1       |
| Tx Registration | `swr-transaction-registration-state` | 1       |
| Tx Form         | `swr-transaction-form-state`         | 3       |
| P2P             | `swr-p2p-state`                      | 1       |

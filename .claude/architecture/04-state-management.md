# State Management

Zustand stores with immer, persist, and devtools middleware.

---

## Three Stores

| Store                  | Purpose                     | Persisted |
| ---------------------- | --------------------------- | --------- |
| `useRegistrationStore` | Flow state, step, tx hashes | Yes       |
| `useFormStore`         | Addresses, NFT flags        | Yes       |
| `useP2PStore`          | Connection state            | Partial   |

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

## Registration Store

```typescript
// apps/web/src/stores/registrationStore.ts

interface RegistrationState {
  registrationType: 'standard' | 'selfRelay' | 'p2pRelay';
  step: RegistrationStep | null;
  acknowledgementHash: `0x${string}` | null;
  registrationHash: `0x${string}` | null;
}

// Step sequences
export const STEP_SEQUENCES = {
  standard: ['acknowledge-and-sign', 'acknowledge-and-pay', 'grace-period', ...],
  selfRelay: ['acknowledge-and-sign', 'switch-and-pay-one', 'grace-period', ...],
  p2pRelay: ['wait-for-connection', 'acknowledge-and-sign', ...],
};
```

---

## Form Store

```typescript
// apps/web/src/stores/formStore.ts

interface FormState {
  registeree: `0x${string}` | null;
  relayer: `0x${string}` | null;
  supportNFT: boolean;
  walletNFT: boolean;
}
```

---

## P2P Store

```typescript
// apps/web/src/stores/p2pStore.ts

interface P2PState {
  peerId: string | null; // Persists
  partnerPeerId: string | null; // Persists
  connectedToPeer: boolean; // Persists
  connectionStatus: P2PConnectionStatus; // Resets on reload
  isInitialized: boolean; // Resets on reload
}
```

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
  clearAllSignatures(); // localStorage signatures
};
```

---

## Storage Keys

| Store        | Key                      | Version |
| ------------ | ------------------------ | ------- |
| Registration | `swr-registration-state` | 1       |
| Form         | `swr-form-state`         | 1       |
| P2P          | `swr-p2p-state`          | 1       |

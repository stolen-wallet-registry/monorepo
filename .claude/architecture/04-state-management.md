# 04: State Management Architecture

This document describes the Zustand-based state management system, including store structure, middleware configuration, selector patterns, and cross-store coordination.

---

## Overview

The application uses **three Zustand stores** with a consistent middleware stack:

| Store                  | Purpose                             | Persisted |
| ---------------------- | ----------------------------------- | --------- |
| `useRegistrationStore` | Flow state, current step, tx hashes | Yes       |
| `useFormStore`         | Form values (addresses, NFT flags)  | Yes       |
| `useP2PStore`          | P2P connection state                | Partial   |

All stores use the same middleware pattern:

- **immer** - Immutable updates with mutable syntax
- **persist** - localStorage persistence with versioning
- **devtools** - Redux DevTools integration (dev only)

---

## Middleware Stack

```typescript
// Pattern used by all stores
export const useExampleStore = create<State & Actions>()(
  devtools(
    // Outer: DevTools
    persist(
      // Middle: Persistence
      immer((set) => ({
        // Inner: Immer mutations
        // state and actions
      })),
      {
        name: 'swr-example-state',
        version: 1,
        migrate: (persisted) => {
          /* ... */
        },
      }
    ),
    { name: 'ExampleStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
```

### Middleware Order Matters

The order `devtools(persist(immer(...)))` ensures:

1. Immer transforms set calls to immutable updates
2. Persist intercepts and stores state changes
3. DevTools logs all actions (dev only)

---

## Registration Store

Manages the registration flow state machine:

```typescript
// File: apps/web/src/stores/registrationStore.ts

export type RegistrationType = 'standard' | 'selfRelay' | 'p2pRelay';

export type RegistrationStep =
  | 'acknowledge-and-sign'
  | 'acknowledge-and-pay'
  | 'switch-and-pay-one'
  | 'wait-for-connection'
  | 'acknowledgement-payment'
  | 'grace-period'
  | 'register-and-sign'
  | 'register-and-pay'
  | 'switch-and-pay-two'
  | 'registration-payment'
  | 'success';

export interface RegistrationState {
  registrationType: RegistrationType;
  step: RegistrationStep | null;
  acknowledgementHash: `0x${string}` | null;
  registrationHash: `0x${string}` | null;
}

export interface RegistrationActions {
  setRegistrationType: (type: RegistrationType) => void;
  setStep: (step: RegistrationStep) => void;
  setAcknowledgementHash: (hash: `0x${string}`) => void;
  setRegistrationHash: (hash: `0x${string}`) => void;
  reset: () => void;
}
```

### Initial State

```typescript
const initialState: RegistrationState = {
  registrationType: 'standard',
  step: null,
  acknowledgementHash: null,
  registrationHash: null,
};
```

### Actions with Logging

```typescript
setRegistrationType: (type) =>
  set((state) => {
    logger.registration.info('Registration type selected', {
      type,
      initialStep: getInitialStep(type),
    });
    state.registrationType = type;
    state.step = getInitialStep(type);
  }),

setStep: (step) =>
  set((state) => {
    logger.registration.info('Step transition', { from: state.step, to: step });
    state.step = step;
  }),

setAcknowledgementHash: (hash) =>
  set((state) => {
    logger.registration.info('Acknowledgement hash received', { hash });
    state.acknowledgementHash = hash;
  }),

setRegistrationHash: (hash) =>
  set((state) => {
    logger.registration.info('Registration hash received', { hash });
    state.registrationHash = hash;
  }),

reset: () => {
  logger.registration.info('Registration state reset');
  set(initialState);
},
```

### Step Sequence Helpers

```typescript
// Step sequences per registration type
export const STEP_SEQUENCES: Record<RegistrationType, RegistrationStep[]> = {
  standard: [
    'acknowledge-and-sign',
    'acknowledge-and-pay',
    'grace-period',
    'register-and-sign',
    'register-and-pay',
    'success',
  ],
  selfRelay: [
    'acknowledge-and-sign',
    'switch-and-pay-one',
    'grace-period',
    'register-and-sign',
    'switch-and-pay-two',
    'success',
  ],
  p2pRelay: [
    'wait-for-connection',
    'acknowledge-and-sign',
    'acknowledgement-payment',
    'grace-period',
    'register-and-sign',
    'registration-payment',
    'success',
  ],
};

// Navigation helpers
export function getNextStep(
  type: RegistrationType,
  currentStep: RegistrationStep
): RegistrationStep | null {
  const sequence = STEP_SEQUENCES[type];
  const currentIndex = sequence.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) {
    return null;
  }
  return sequence[currentIndex + 1];
}

export function getPreviousStep(
  type: RegistrationType,
  currentStep: RegistrationStep
): RegistrationStep | null {
  const sequence = STEP_SEQUENCES[type];
  const currentIndex = sequence.indexOf(currentStep);
  if (currentIndex <= 0) {
    return null;
  }
  return sequence[currentIndex - 1];
}

// Initial step per type
function getInitialStep(type: RegistrationType): RegistrationStep {
  switch (type) {
    case 'standard':
    case 'selfRelay':
      return 'acknowledge-and-sign';
    case 'p2pRelay':
      return 'wait-for-connection';
  }
}
```

---

## Form Store

Stores registration form values:

```typescript
// File: apps/web/src/stores/formStore.ts

export interface FormState {
  registeree: `0x${string}` | null; // Wallet being registered as stolen
  relayer: `0x${string}` | null; // Gas wallet (self-relay) or helper (P2P)
  supportNFT: boolean; // Future: Support token option
  walletNFT: boolean; // Future: Wallet token option
}

export interface FormActions {
  setRegisteree: (address: `0x${string}`) => void;
  setRelayer: (address: `0x${string}`) => void;
  setSupportNFT: (value: boolean) => void;
  setWalletNFT: (value: boolean) => void;
  setFormValues: (values: Partial<FormState>) => void;
  reset: () => void;
}
```

### Initial State

```typescript
const initialState: FormState = {
  registeree: null,
  relayer: null,
  supportNFT: false,
  walletNFT: false,
};
```

### Batch Updates

```typescript
setFormValues: (values) =>
  set((state) => {
    logger.store.debug('Form values batch updated', { values });
    Object.assign(state, values);  // Immer allows this
  }),
```

---

## P2P Store

Manages peer-to-peer connection state:

```typescript
// File: apps/web/src/stores/p2pStore.ts

export type P2PConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface P2PState {
  peerId: string | null; // Local peer ID
  partnerPeerId: string | null; // Connected partner's peer ID
  connectedToPeer: boolean; // Connection status flag
  connectionStatus: P2PConnectionStatus;
  errorMessage: string | null;
  isInitialized: boolean; // Whether libp2p node is ready
}

export interface P2PActions {
  setPeerId: (peerId: string) => void;
  setPartnerPeerId: (peerId: string) => void;
  setConnectedToPeer: (connected: boolean) => void;
  setConnectionStatus: (status: P2PConnectionStatus, errorMessage?: string) => void;
  setInitialized: (initialized: boolean) => void;
  setP2PValues: (values: Partial<P2PState>) => void;
  reset: () => void;
}
```

### Partial Persistence

P2P store uses partial persistence - some fields reset on page refresh:

```typescript
migrate: (persisted) => {
  if (!persisted || typeof persisted !== 'object') {
    return initialState;
  }

  const state = persisted as Partial<P2PState>;

  return {
    // These persist across refreshes
    peerId: state.peerId ?? initialState.peerId,
    partnerPeerId: state.partnerPeerId ?? initialState.partnerPeerId,
    connectedToPeer: state.connectedToPeer ?? initialState.connectedToPeer,

    // These reset to initial values (ephemeral state)
    connectionStatus: initialState.connectionStatus,
    errorMessage: initialState.errorMessage,
    isInitialized: initialState.isInitialized,
  };
},
```

**Why?** The libp2p node needs re-initialization each browser session. Preserving `connectionStatus: 'connected'` after refresh would be misleading.

### Connection Status Sync

```typescript
setConnectionStatus: (status, errorMessage) =>
  set((state) => {
    logger.p2p.info('P2P connection status updated', { status, errorMessage });
    state.connectionStatus = status;
    state.errorMessage = errorMessage ?? null;

    // Auto-sync connectedToPeer flag
    if (status === 'connected') {
      state.connectedToPeer = true;
    } else if (status === 'disconnected' || status === 'error') {
      state.connectedToPeer = false;
    }
  }),
```

---

## Selector Patterns

All stores export granular selectors using `useShallow` for optimized re-renders:

### Registration Store Selectors

```typescript
// File: apps/web/src/stores/registrationStore.ts

import { useShallow } from 'zustand/shallow';

// Select registration type only
export const useRegistrationType = () =>
  useRegistrationStore(
    useShallow((s) => ({
      registrationType: s.registrationType,
      setRegistrationType: s.setRegistrationType,
    }))
  );

// Select current step only
export const useRegistrationStep = () =>
  useRegistrationStore(
    useShallow((s) => ({
      step: s.step,
      setStep: s.setStep,
    }))
  );

// Select transaction hashes
export const useRegistrationTxHashes = () =>
  useRegistrationStore(
    useShallow((s) => ({
      acknowledgementHash: s.acknowledgementHash,
      registrationHash: s.registrationHash,
      setAcknowledgementHash: s.setAcknowledgementHash,
      setRegistrationHash: s.setRegistrationHash,
    }))
  );

// Select full flow state
export const useRegistrationFlow = () =>
  useRegistrationStore(
    useShallow((s) => ({
      registrationType: s.registrationType,
      step: s.step,
      setStep: s.setStep,
      reset: s.reset,
    }))
  );
```

### Form Store Selectors

```typescript
// File: apps/web/src/stores/formStore.ts

// Select wallet addresses
export const useFormAddresses = () =>
  useFormStore(
    useShallow((s) => ({
      registeree: s.registeree,
      relayer: s.relayer,
      setRegisteree: s.setRegisteree,
      setRelayer: s.setRelayer,
    }))
  );

// Select NFT options
export const useFormNFTOptions = () =>
  useFormStore(
    useShallow((s) => ({
      supportNFT: s.supportNFT,
      walletNFT: s.walletNFT,
      setSupportNFT: s.setSupportNFT,
      setWalletNFT: s.setWalletNFT,
    }))
  );

// Read-only selectors
export const useRegisteree = () => useFormStore((s) => s.registeree);
export const useRelayer = () => useFormStore((s) => s.relayer);
```

### P2P Store Selectors

```typescript
// File: apps/web/src/stores/p2pStore.ts

// Select peer IDs
export const useP2PPeerIds = () =>
  useP2PStore(
    useShallow((s) => ({
      peerId: s.peerId,
      partnerPeerId: s.partnerPeerId,
      setPeerId: s.setPeerId,
      setPartnerPeerId: s.setPartnerPeerId,
    }))
  );

// Select connection status
export const useP2PConnection = () =>
  useP2PStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      connectedToPeer: s.connectedToPeer,
      errorMessage: s.errorMessage,
      isInitialized: s.isInitialized,
      setConnectionStatus: s.setConnectionStatus,
      setConnectedToPeer: s.setConnectedToPeer,
      setInitialized: s.setInitialized,
    }))
  );

// Simple read-only selectors
export const useP2PConnectionStatus = () => useP2PStore((s) => s.connectionStatus);
export const useIsConnectedToPeer = () => useP2PStore((s) => s.connectedToPeer);
```

### Why useShallow?

Without `useShallow`, returning an object from a selector causes re-renders on every store update:

```typescript
// BAD: Creates new object reference on every store change
const { step, setStep } = useRegistrationStore((s) => ({
  step: s.step,
  setStep: s.setStep,
}));

// GOOD: useShallow compares object properties
const { step, setStep } = useRegistrationStore(
  useShallow((s) => ({
    step: s.step,
    setStep: s.setStep,
  }))
);
```

---

## Cross-Store Coordination

### Combined Reset

```typescript
// File: apps/web/src/stores/index.ts

export function resetAllStores() {
  useRegistrationStore.getState().reset();
  useFormStore.getState().reset();
  useP2PStore.getState().reset();
}
```

Used in `useStepNavigation` hook:

```typescript
// File: apps/web/src/hooks/useStepNavigation.ts

const resetFlow = useCallback(() => {
  logger.registration.info('Resetting entire registration flow');
  resetRegistration(); // registrationStore.reset()
  resetForm(); // formStore.reset()
  clearAllSignatures(); // Also clear localStorage signatures
}, [resetRegistration, resetForm]);
```

### Data Flow Across Stores

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
   │ formStore     │  │registrationSt │  │  p2pStore     │
   │               │  │               │  │               │
   │ registeree────│──│──step────────│──│──peerId       │
   │ relayer       │  │ registrationType │ partnerPeerId│
   │ supportNFT    │  │ ackHash       │  │ connectedTo  │
   │ walletNFT     │  │ regHash       │  │ status       │
   └───────────────┘  └───────────────┘  └───────────────┘
           │                 │                 │
           │   Components read from multiple stores
           └─────────────────┼─────────────────┘
                             │
                             ▼
              ┌─────────────────────────┐
              │   UI Components         │
              │                         │
              │  • StepRenderer         │
              │  • SignatureCard        │
              │  • TransactionCard      │
              │  • GracePeriodTimer     │
              └─────────────────────────┘
```

### Example: Multi-Store Access

```typescript
// File: apps/web/src/components/registration/steps/AcknowledgementPayStep.tsx

export function AcknowledgementPayStep({ onComplete }) {
  // Registration store - for step management
  const { registrationType, setAcknowledgementHash } = useRegistrationStore();

  // Form store - for addresses
  const { registeree, relayer } = useFormStore();

  // Expected wallet depends on registration type
  const expectedWallet = registrationType === 'selfRelay' ? relayer : registeree;

  // ... component logic
}
```

---

## Persistence Configuration

### Storage Key Names

| Store        | Storage Key              | Version |
| ------------ | ------------------------ | ------- |
| Registration | `swr-registration-state` | 1       |
| Form         | `swr-form-state`         | 1       |
| P2P          | `swr-p2p-state`          | 1       |

### Version Migration

Each store includes a migration function for handling schema changes:

```typescript
persist(
  immer((set) => ({
    /* ... */
  })),
  {
    name: 'swr-registration-state',
    version: 1,
    migrate: (persisted) => {
      // Validate basic shape
      if (!persisted || typeof persisted !== 'object') {
        return initialState;
      }

      const state = persisted as Partial<RegistrationState>;

      // Ensure all required fields exist with fallbacks
      return {
        registrationType: state.registrationType ?? initialState.registrationType,
        step: state.step ?? initialState.step,
        acknowledgementHash: state.acknowledgementHash ?? initialState.acknowledgementHash,
        registrationHash: state.registrationHash ?? initialState.registrationHash,
      };
    },
  }
);
```

**Migration Strategy:**

1. Check for null/invalid persisted data
2. Spread existing values with fallbacks to initial state
3. Increment version when schema changes
4. Add migration logic for version transitions

---

## DevTools Integration

All stores integrate with Redux DevTools in development:

```typescript
devtools(persist(/* ... */), {
  name: 'RegistrationStore',
  enabled: process.env.NODE_ENV === 'development',
});
```

**DevTools Features:**

- Action history with payload
- State diff visualization
- Time-travel debugging
- State export/import

---

## Usage Patterns

### Direct Store Access

```typescript
// When you need immediate value (not reactive)
const currentStep = useRegistrationStore.getState().step;

// When triggering action from outside React
useRegistrationStore.getState().setStep('grace-period');
```

### Reactive Subscriptions

```typescript
// Subscribe to store changes (for non-React code)
const unsubscribe = useRegistrationStore.subscribe(
  (state) => state.step,
  (step, previousStep) => {
    console.log('Step changed from', previousStep, 'to', step);
  }
);
```

### Component Usage

```typescript
// Prefer granular selectors
function StepContent() {
  // GOOD: Only re-renders when step changes
  const { step } = useRegistrationStep();

  // BAD: Re-renders on any store change
  const step = useRegistrationStore((s) => s.step);

  return <div>Current step: {step}</div>;
}
```

---

## File Structure

```
apps/web/src/stores/
├── index.ts              # Barrel export, resetAllStores
├── registrationStore.ts  # Flow state, steps, tx hashes
├── formStore.ts          # Form values (addresses, flags)
└── p2pStore.ts           # P2P connection state
```

---

## Summary

The state management system provides:

1. **Three focused stores** with single responsibilities
2. **Consistent middleware stack** (immer + persist + devtools)
3. **Granular selectors** with useShallow for performance
4. **Persistence with versioning** for recovery across refreshes
5. **Cross-store coordination** via combined reset and multi-store access
6. **DevTools integration** for debugging in development
7. **Type-safe actions** with full TypeScript support
8. **Logging integration** for debugging state changes

The pattern ensures:

- Minimal re-renders through selector optimization
- Recovery of in-progress registrations via persistence
- Easy debugging via DevTools and logging
- Clear separation of concerns across stores

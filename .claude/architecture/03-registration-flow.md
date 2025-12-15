# 03: Registration Flow Architecture

This document describes the step-based registration flow system, including state machines for each registration method, component architecture, and navigation mechanics.

---

## Overview

The Stolen Wallet Registry uses a **step-based flow** system for wallet registration. There are **three registration methods**, each with its own step sequence:

| Method         | Description                                       | When to Use                                       |
| -------------- | ------------------------------------------------- | ------------------------------------------------- |
| **Standard**   | Sign and pay from same wallet                     | Wallet compromised but still accessible           |
| **Self-Relay** | Sign with compromised wallet, pay with another    | Wallet drained but user has another funded wallet |
| **P2P Relay**  | Sign with compromised wallet, helper pays via P2P | Wallet completely compromised, no funds           |

All methods follow the same core pattern:

1. **Acknowledgement Phase** - Sign intent to register
2. **Grace Period** - Wait for anti-phishing delay
3. **Registration Phase** - Complete registration

---

## Step Types

The system defines **11 possible steps** that are combined into different sequences based on registration method:

```typescript
// File: apps/web/src/stores/registrationStore.ts

export type RegistrationStep =
  | 'acknowledge-and-sign' // Sign ACK with registeree wallet
  | 'acknowledge-and-pay' // Submit ACK tx (standard)
  | 'switch-and-pay-one' // Switch wallet, submit ACK (self-relay)
  | 'wait-for-connection' // Wait for P2P peer connection
  | 'acknowledgement-payment' // Wait for helper's ACK tx (P2P)
  | 'grace-period' // Wait for time window to open
  | 'register-and-sign' // Sign REG with registeree wallet
  | 'register-and-pay' // Submit REG tx (standard)
  | 'switch-and-pay-two' // Switch wallet, submit REG (self-relay)
  | 'registration-payment' // Wait for helper's REG tx (P2P)
  | 'success'; // Registration complete
```

---

## Step Sequences Per Method

Each registration type has a defined step sequence:

```typescript
// File: apps/web/src/stores/registrationStore.ts

export const STEP_SEQUENCES: Record<RegistrationType, RegistrationStep[]> = {
  // Standard: 6 steps
  // User signs and pays from the same wallet
  standard: [
    'acknowledge-and-sign', // Sign ACK message
    'acknowledge-and-pay', // Submit ACK transaction
    'grace-period', // Wait for window to open
    'register-and-sign', // Sign REG message
    'register-and-pay', // Submit REG transaction
    'success', // Done
  ],

  // Self-Relay: 6 steps
  // User signs with stolen wallet, pays with gas wallet
  selfRelay: [
    'acknowledge-and-sign', // Sign ACK with stolen wallet
    'switch-and-pay-one', // Switch to gas wallet, submit ACK
    'grace-period', // Wait for window to open
    'register-and-sign', // Switch back, sign REG with stolen
    'switch-and-pay-two', // Switch to gas wallet, submit REG
    'success', // Done
  ],

  // P2P Relay: 7 steps
  // User signs with stolen wallet, helper pays via P2P
  p2pRelay: [
    'wait-for-connection', // Wait for P2P peer
    'acknowledge-and-sign', // Sign ACK message
    'acknowledgement-payment', // Helper submits ACK
    'grace-period', // Wait for window to open
    'register-and-sign', // Sign REG message
    'registration-payment', // Helper submits REG
    'success', // Done
  ],
};
```

---

## State Machine Diagrams

### Standard Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STANDARD REGISTRATION                            │
│                    (Sign and Pay from Same Wallet)                       │
└─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐
  │ acknowledge-and-sign│  ← User connected with registeree wallet
  │                     │
  │ • Form collects     │
  │   registeree address│
  │ • Sign EIP-712 ACK  │
  │ • Store signature   │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │ acknowledge-and-pay │  ← Submit ACK transaction
  │                     │
  │ • Retrieve stored   │
  │   signature         │
  │ • Submit to contract│
  │ • Wait for confirm  │
  │ • Store tx hash     │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │    grace-period     │  ← Wait ~1-4 minutes
  │                     │
  │ • Read deadlines    │
  │   from contract     │
  │ • Countdown timer   │
  │ • Block-based timing│
  └─────────┬───────────┘
            │ (window opens)
            ▼
  ┌─────────────────────┐
  │  register-and-sign  │  ← Sign registration
  │                     │
  │ • Sign EIP-712 REG  │
  │ • Store signature   │
  │ • Same wallet       │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │  register-and-pay   │  ← Submit REG transaction
  │                     │
  │ • Retrieve signature│
  │ • Submit to contract│
  │ • Wait for confirm  │
  │ • Store tx hash     │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │       success       │  ← Registration complete
  │                     │
  │ • Show confirmation │
  │ • Display tx links  │
  │ • Reset option      │
  └─────────────────────┘
```

### Self-Relay Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SELF-RELAY REGISTRATION                           │
│                (Sign with Stolen, Pay with Gas Wallet)                   │
└─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐
  │ acknowledge-and-sign│  ← Connected: STOLEN WALLET
  │                     │
  │ • Form collects     │
  │   - registeree addr │
  │   - gas wallet addr │
  │ • Sign EIP-712 ACK  │
  │   with stolen wallet│
  │ • Store signature   │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │  switch-and-pay-one │  ← Switch to: GAS WALLET
  │                     │
  │ • WalletSwitchPrompt│
  │   shown until switch│
  │ • Retrieve signature│
  │ • Submit ACK tx     │
  │   (gas wallet pays) │
  │ • Store tx hash     │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │    grace-period     │  ← Any wallet OK
  │                     │
  │ • Countdown timer   │
  │ • Block-based timing│
  └─────────┬───────────┘
            │ (window opens)
            ▼
  ┌─────────────────────┐
  │  register-and-sign  │  ← Switch to: STOLEN WALLET
  │                     │
  │ • WalletSwitchPrompt│
  │   shown until switch│
  │ • Sign EIP-712 REG  │
  │   with stolen wallet│
  │ • Store signature   │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │  switch-and-pay-two │  ← Switch to: GAS WALLET
  │                     │
  │ • WalletSwitchPrompt│
  │ • Retrieve signature│
  │ • Submit REG tx     │
  │   (gas wallet pays) │
  │ • Store tx hash     │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │       success       │
  └─────────────────────┘

Key: Wallet switching is the defining characteristic.
     User must switch back and forth between wallets.
```

### P2P Relay Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         P2P RELAY REGISTRATION                           │
│              (Sign with Stolen, Helper Pays via libp2p)                  │
└─────────────────────────────────────────────────────────────────────────┘

REGISTEREE (User)                       RELAYER (Helper)
─────────────────                       ────────────────

┌─────────────────────┐
│ wait-for-connection │  ← Exchange peer IDs
│                     │
│ • Connect to relay  │                 • Connect to relay
│ • Display peer ID   │  ──CONNECT──→   • Enter user's peer ID
│ • Wait for dial     │  ←─────────────  • Dial user
│ • Confirm connected │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ acknowledge-and-sign│  ← Sign ACK
│                     │
│ • Sign EIP-712 ACK  │
│ • Send via P2P      │  ──ACK_SIG──→   • Receive signature
│   /swr/ack/sig/1.0.0│                 • Validate
└─────────┬───────────┘                 • Submit ACK tx
          │                             │
          ▼                             ▼
┌─────────────────────┐
│acknowledgement-pay  │  ← Wait for ACK tx
│                     │
│ • Wait for notif    │  ←─ACK_PAID──   • Send tx hash
│ • Receive tx hash   │
│ • Store hash        │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│    grace-period     │  ← Both wait
│                     │                 (Helper waits too)
│ • Countdown timer   │
└─────────┬───────────┘
          │ (window opens)
          ▼
┌─────────────────────┐
│  register-and-sign  │  ← Sign REG
│                     │
│ • Sign EIP-712 REG  │
│ • Send via P2P      │  ──REG_SIG──→   • Receive signature
│   /swr/reg/sig/1.0.0│                 • Validate
└─────────┬───────────┘                 • Submit REG tx
          │                             │
          ▼                             ▼
┌─────────────────────┐
│ registration-payment│  ← Wait for REG tx
│                     │
│ • Wait for notif    │  ←─REG_PAID──   • Send tx hash
│ • Receive tx hash   │
│ • Store hash        │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│       success       │
└─────────────────────┘

P2P Protocol Messages:
• /swr/connected/1.0.0 - Initial handshake
• /swr/acknowledgement/signature/1.0.0 - ACK signature transfer
• /swr/acknowledgement/payment/1.0.0 - ACK tx notification
• /swr/register/signature/1.0.0 - REG signature transfer
• /swr/register/payment/1.0.0 - REG tx notification
```

---

## Component Architecture

### Component Hierarchy

```
RegistrationPage (per method)
├── StepIndicator (sidebar)
│   └── Shows step progress
└── StepRenderer
    ├── InitialFormStep         (acknowledge-and-sign)
    ├── AcknowledgementPayStep  (acknowledge-and-pay, switch-and-pay-one)
    ├── GracePeriodStep         (grace-period)
    ├── RegistrationSignStep    (register-and-sign)
    ├── RegistrationPayStep     (register-and-pay, switch-and-pay-two)
    ├── SuccessStep             (success)
    └── P2P-specific steps      (wait-for-connection, *-payment)
```

### File Structure

```
apps/web/src/
├── pages/
│   ├── StandardRegistrationPage.tsx    # Standard flow page
│   ├── SelfRelayRegistrationPage.tsx   # Self-relay flow page
│   ├── P2PRegistereeRegistrationPage.tsx   # P2P user page
│   └── P2PRelayerRegistrationPage.tsx      # P2P helper page
│
├── components/
│   ├── registration/
│   │   ├── StepRenderer.tsx            # Step → component mapping
│   │   ├── index.ts                    # Barrel export
│   │   └── steps/
│   │       ├── InitialFormStep.tsx     # Form + ACK signing
│   │       ├── AcknowledgementPayStep.tsx  # Submit ACK tx
│   │       ├── GracePeriodStep.tsx     # Countdown timer
│   │       ├── RegistrationSignStep.tsx    # Sign REG
│   │       ├── RegistrationPayStep.tsx     # Submit REG tx
│   │       ├── SuccessStep.tsx         # Completion screen
│   │       ├── WaitForConnectionStep.tsx   # P2P connection
│   │       ├── P2PAckSignStep.tsx      # P2P ACK signing
│   │       ├── P2PAckPayStep.tsx       # P2P wait for ACK tx
│   │       ├── P2PRegSignStep.tsx      # P2P REG signing
│   │       └── P2PRegPayStep.tsx       # P2P wait for REG tx
│   │
│   └── composed/
│       ├── StepIndicator/              # Progress indicator
│       ├── WalletSwitchPrompt/         # Self-relay wallet switch
│       ├── SignatureCard/              # Signing UI
│       ├── TransactionCard/            # Tx submission UI
│       ├── GracePeriodTimer/           # Timer display
│       └── ExplorerLink/               # Block explorer links
│
├── stores/
│   ├── registrationStore.ts            # Step state, tx hashes
│   └── formStore.ts                    # Form values
│
├── hooks/
│   └── useStepNavigation.ts            # Navigation helpers
│
└── lib/
    ├── schemas/
    │   ├── registration.ts             # Form validation
    │   ├── address.ts                  # Address schemas
    │   └── signature.ts                # Signature schemas
    └── signatures/
        ├── storage.ts                  # Signature persistence
        └── utils.ts                    # Parsing utilities
```

---

## StepRenderer Component

The `StepRenderer` maps step identifiers to React components:

```typescript
// File: apps/web/src/components/registration/StepRenderer.tsx

export interface StepRendererProps {
  currentStep: RegistrationStep | null;
  onStepComplete: () => void;
}

export function StepRenderer({ currentStep, onStepComplete }: StepRendererProps) {
  if (!currentStep) {
    return <div>Initializing registration flow...</div>;
  }

  // Map steps to components
  // Note: Some steps share components (e.g., switch-and-pay-one uses AcknowledgementPayStep)
  // The component internally checks registrationType to show WalletSwitchPrompt
  const stepComponents: Record<RegistrationStep, ReactNode> = {
    // Initial form + ACK signing
    'acknowledge-and-sign': <InitialFormStep onComplete={onStepComplete} />,

    // Standard: submit ACK tx
    'acknowledge-and-pay': <AcknowledgementPayStep onComplete={onStepComplete} />,

    // Self-relay: switch wallet, submit ACK tx (same component, different behavior)
    'switch-and-pay-one': <AcknowledgementPayStep onComplete={onStepComplete} />,

    // P2P: wait for peer connection
    'wait-for-connection': <WaitForConnectionStep onComplete={onStepComplete} />,

    // P2P: wait for helper to submit ACK
    'acknowledgement-payment': <P2PAckPayStep onComplete={onStepComplete} />,

    // Grace period countdown
    'grace-period': <GracePeriodStep onComplete={onStepComplete} />,

    // Sign registration
    'register-and-sign': <RegistrationSignStep onComplete={onStepComplete} />,

    // Standard: submit REG tx
    'register-and-pay': <RegistrationPayStep onComplete={onStepComplete} />,

    // Self-relay: switch wallet, submit REG tx
    'switch-and-pay-two': <RegistrationPayStep onComplete={onStepComplete} />,

    // P2P: wait for helper to submit REG
    'registration-payment': <P2PRegPayStep onComplete={onStepComplete} />,

    // Success screen
    success: <SuccessStep />,
  };

  return <>{stepComponents[currentStep]}</>;
}
```

---

## Navigation Mechanics

### useStepNavigation Hook

Provides step navigation controls:

```typescript
// File: apps/web/src/hooks/useStepNavigation.ts

export interface UseStepNavigationResult {
  currentStep: RegistrationStep | null;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (step: RegistrationStep) => void;
  resetFlow: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function useStepNavigation(): UseStepNavigationResult {
  const { registrationType, step, setStep, reset: resetRegistration } = useRegistrationStore();
  const { reset: resetForm } = useFormStore();

  const goToNextStep = useCallback(() => {
    if (!step) return;

    const nextStep = getNextStep(registrationType, step);
    if (nextStep) {
      logger.registration.info('Advancing to next step', { from: step, to: nextStep });
      setStep(nextStep);
    }
  }, [registrationType, step, setStep]);

  const goToPreviousStep = useCallback(() => {
    if (!step) return;

    const prevStep = getPreviousStep(registrationType, step);
    if (prevStep) {
      logger.registration.info('Going back', { from: step, to: prevStep });
      setStep(prevStep);
    }
  }, [registrationType, step, setStep]);

  const resetFlow = useCallback(() => {
    logger.registration.info('Resetting entire registration flow');
    resetRegistration();
    resetForm();
    clearAllSignatures();
  }, [resetRegistration, resetForm]);

  return {
    currentStep: step,
    goToNextStep,
    goToPreviousStep,
    goToStep: setStep,
    resetFlow,
    isFirstStep: step ? !getPreviousStep(registrationType, step) : true,
    isLastStep: step === 'success',
  };
}
```

### Helper Functions

```typescript
// File: apps/web/src/stores/registrationStore.ts

// Get next step in sequence
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

// Get previous step in sequence
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

// Get initial step for registration type
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

## Wallet Validation Per Step

Different steps require different wallet connections:

| Step                      | Standard   | Self-Relay     | P2P           |
| ------------------------- | ---------- | -------------- | ------------- |
| `acknowledge-and-sign`    | Registeree | Registeree     | Registeree    |
| `acknowledge-and-pay`     | Registeree | -              | -             |
| `switch-and-pay-one`      | -          | **Gas Wallet** | -             |
| `wait-for-connection`     | -          | -              | Any           |
| `acknowledgement-payment` | -          | -              | Any (waiting) |
| `grace-period`            | Any        | Any            | Any           |
| `register-and-sign`       | Registeree | Registeree     | Registeree    |
| `register-and-pay`        | Registeree | -              | -             |
| `switch-and-pay-two`      | -          | **Gas Wallet** | -             |
| `registration-payment`    | -          | -              | Any (waiting) |
| `success`                 | Any        | Any            | Any           |

### WalletSwitchPrompt Component

Used in self-relay mode to guide wallet switching:

```typescript
// Shows when wrong wallet is connected
<WalletSwitchPrompt
  currentAddress={address}           // Currently connected
  expectedAddress={expectedWallet}   // What we need
  expectedLabel="Gas Wallet"         // Display label
  currentLabel="Stolen Wallet"       // Current wallet label
  currentChainId={chainId}
  expectedChainId={chainId}
/>
```

---

## Form Validation (Zod Schemas)

### Initial Form Schema

```typescript
// File: apps/web/src/lib/schemas/registration.ts

import { z } from 'zod';
import { ethereumAddressSchema, optionalEthereumAddressSchema } from './address';

export const initialFormSchema = z.object({
  registeree: ethereumAddressSchema, // Required, 0x + 40 hex
  relayer: optionalEthereumAddressSchema, // Optional, empty or valid
  supportNFT: z.boolean(), // Future feature
  walletNFT: z.boolean(), // Future feature
});

export type InitialFormInput = z.input<typeof initialFormSchema>;
export type InitialFormValues = z.output<typeof initialFormSchema>;
```

### Address Schema

```typescript
// File: apps/web/src/lib/schemas/address.ts

import { z } from 'zod';
import { isAddress } from 'viem';

export const ethereumAddressSchema = z
  .string()
  .refine(isAddress, 'Invalid Ethereum address')
  .transform((val) => val as `0x${string}`);

export const optionalEthereumAddressSchema = z
  .string()
  .refine((val) => val === '' || isAddress(val), 'Invalid Ethereum address')
  .transform((val) => (val === '' ? undefined : (val as `0x${string}`)));
```

---

## Step Component Responsibilities

### InitialFormStep

**Purpose:** Collect addresses and sign ACK

**Responsibilities:**

1. Display form with registeree address (auto-filled from connected wallet)
2. For self-relay: collect gas wallet address
3. Validate addresses (different for self-relay)
4. Save form values to formStore
5. Fetch hash struct for signing deadline
6. Display SignatureCard for ACK signing
7. Store signature on success
8. Call `onComplete()` to advance

**Key Logic:**

```typescript
// Registeree is synced with connected wallet until form is submitted
useEffect(() => {
  if (!showSignature && address) {
    setValue('registeree', address);
  }
}, [address, showSignature]);

// Different forwarder based on method
const forwarderAddress = isSelfRelay ? (relayer as `0x${string}`) : address;
```

### AcknowledgementPayStep / switch-and-pay-one

**Purpose:** Submit ACK transaction

**Responsibilities:**

1. Retrieve stored signature from localStorage
2. For self-relay: show WalletSwitchPrompt until correct wallet
3. Display TransactionCard with submission controls
4. Submit transaction to contract
5. Wait for confirmation
6. Store tx hash in registrationStore
7. Call `onComplete()` to advance

**Key Logic:**

```typescript
// Expected wallet differs by method
const expectedWallet = isSelfRelay ? relayer : registeree;

// Disable submit until correct wallet connected
const isCorrectWallet = address && expectedWallet && areAddressesEqual(address, expectedWallet);
```

### GracePeriodStep

**Purpose:** Display countdown until registration window opens

**Responsibilities:**

1. Fetch deadlines from contract (`useContractDeadlines`)
2. Display countdown timer with block information
3. Show acknowledgement tx confirmation
4. Auto-advance when timer expires
5. Handle block-based timing (not wall-clock)

**Key Logic:**

```typescript
// Countdown targets the START block (when window opens)
const { timeRemaining, blocksLeft, isExpired } = useCountdownTimer({
  targetBlock: deadlines?.start,
  currentBlock: deadlines?.currentBlock,
  chainId,
  onExpire: onComplete, // Auto-advance when expired
  autoStart: true,
});
```

### RegistrationSignStep

**Purpose:** Sign REG message after grace period

**Responsibilities:**

1. Ensure correct wallet connected (always registeree)
2. For self-relay: show WalletSwitchPrompt (switch back to stolen)
3. Fetch fresh deadline from contract
4. Display SignatureCard for REG signing
5. Store signature on success
6. Call `onComplete()` to advance

### RegistrationPayStep / switch-and-pay-two

**Purpose:** Submit REG transaction

**Responsibilities:**

1. Retrieve stored signature
2. For self-relay: show WalletSwitchPrompt (switch to gas wallet)
3. Display TransactionCard
4. Submit transaction
5. Wait for confirmation
6. Store tx hash
7. Call `onComplete()` to advance to success

### SuccessStep

**Purpose:** Display completion confirmation

**Responsibilities:**

1. Display registered wallet address
2. Show transaction links (ACK and REG)
3. Provide navigation options (home, register another)
4. Clear state on navigation

---

## StepIndicator Component

Visual progress tracker for the registration flow:

```typescript
// File: apps/web/src/components/composed/StepIndicator/StepIndicator.tsx

export function StepIndicator({
  registrationType,
  currentStep,
  stepLabels = {},
  stepDescriptions = {},
}: StepIndicatorProps) {
  const sequence = STEP_SEQUENCES[registrationType];

  return (
    <nav aria-label="Registration progress">
      <ol>
        {sequence.map((step, index) => {
          const status = getStepStatus(step, currentStep, sequence);
          // status: 'pending' | 'current' | 'completed'

          return (
            <li key={step}>
              <StepIcon status={status} />
              <StepLabel label={stepLabels[step] ?? DEFAULT_LABELS[step]} />
              {!isLast && <ConnectorLine completed={status === 'completed'} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Status calculation
function getStepStatus(step, currentStep, sequence): StepStatus {
  const stepIndex = sequence.indexOf(step);
  const currentIndex = sequence.indexOf(currentStep);

  // Success shows as completed when current (not spinner)
  if (step === 'success' && currentStep === 'success') return 'completed';

  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'current';
  return 'pending';
}
```

**Visual States:**

- **Completed:** Green check icon, green text, green connector line
- **Current:** Primary color spinner, normal text
- **Pending:** Gray circle, muted text, gray connector line

---

## Registration Page Structure

Each registration type has its own page that orchestrates the flow:

```typescript
// File: apps/web/src/pages/StandardRegistrationPage.tsx

export function StandardRegistrationPage() {
  const { isConnected } = useAccount();
  const { registrationType, step, setRegistrationType } = useRegistrationStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Initialize registration type on mount
  useEffect(() => {
    if (registrationType !== 'standard') {
      setRegistrationType('standard');
    }
  }, [registrationType, setRegistrationType]);

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) setLocation('/');
  }, [isConnected]);

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-8">
      {/* Sidebar: Step indicator */}
      <aside>
        <Card>
          <CardHeader>
            <CardTitle>Standard Registration</CardTitle>
            <CardDescription>Sign and pay from the same wallet</CardDescription>
          </CardHeader>
          <CardContent>
            <StepIndicator
              registrationType="standard"
              currentStep={step}
              stepDescriptions={STEP_DESCRIPTIONS}
            />
          </CardContent>
        </Card>
      </aside>

      {/* Main: Current step content */}
      <main>
        <Card>
          <CardHeader>
            <CardTitle>{STEP_TITLES[step]}</CardTitle>
            <CardDescription>{STEP_DESCRIPTIONS[step]}</CardDescription>
          </CardHeader>
          <CardContent>
            <StepRenderer
              currentStep={step}
              onStepComplete={goToNextStep}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

---

## State Persistence

The registration flow state persists across page refreshes:

```typescript
// Registration store persists to localStorage
export const useRegistrationStore = create<RegistrationState & RegistrationActions>()(
  devtools(
    persist(
      immer((set) => ({
        // ... state and actions
      })),
      {
        name: 'swr-registration-state',
        version: 1,
        migrate: (persisted) => {
          // Handle version migrations
          return { ...initialState, ...persisted };
        },
      }
    ),
    { name: 'RegistrationStore' }
  )
);

// Form store also persists
export const useFormStore = create<FormState & FormActions>()(
  devtools(
    persist(
      immer((set) => ({
        // ... state and actions
      })),
      {
        name: 'swr-form-state',
        version: 1,
      }
    ),
    { name: 'FormStore' }
  )
);
```

**Reset Triggers:**

- User clicks "Back to Home" from any step
- User clicks "Register Another Wallet" from success
- Manual reset via `resetFlow()` hook
- Version migration detects incompatible state

---

## Error Recovery Patterns

### Step Component Error Handling

Each step component handles errors gracefully:

```typescript
// Pattern: Missing required data
if (!registeree) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Missing registration data. Please start over from the beginning.
      </AlertDescription>
    </Alert>
  );
}

// Pattern: Contract data loading error
if (hasContractError) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Failed to load contract data. Please try again.
        <Button variant="link" onClick={() => refetch()}>Retry</Button>
      </AlertDescription>
    </Alert>
  );
}
```

### Transaction Retry

```typescript
// TransactionCard provides retry functionality
<TransactionCard
  status={getStatus()}
  error={errorMessage}
  onRetry={() => {
    reset();          // Reset hook state
    setLocalError(null);
  }}
/>
```

### Signature Retry

```typescript
// SignatureCard provides retry after signing error
<SignatureCard
  status={signatureStatus}
  error={signatureError}
  onRetry={() => {
    resetSigning();
    setSignatureStatus('idle');
    setSignatureError(null);
  }}
/>
```

---

## Logging Integration

The registration flow uses category-based logging throughout:

```typescript
// Step transitions
logger.registration.info('Step transition', { from: state.step, to: step });

// Form submission
logger.registration.info('Form submitted', {
  registrationType,
  registeree: values.registeree,
  isSelfRelay,
});

// Signature operations
logger.signature.info('Acknowledgement signature obtained', {
  signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
});

// Contract interactions
logger.contract.info('Submitting acknowledgementOfRegistry to contract', {
  deadline: storedSignature.deadline.toString(),
  registeree,
});

// Errors
logger.signature.error('Acknowledgement signing failed', { error: err.message }, err);
```

---

## Summary

The registration flow system provides:

1. **Three registration methods** with distinct step sequences
2. **Step-based state machine** with clear transitions
3. **Component composition** via StepRenderer mapping
4. **Navigation helpers** via useStepNavigation hook
5. **State persistence** across page refreshes
6. **Wallet validation** per step (especially for self-relay)
7. **Form validation** with Zod schemas
8. **Visual progress tracking** via StepIndicator
9. **Error recovery** patterns in each component
10. **Comprehensive logging** for debugging

The architecture ensures users can:

- Resume interrupted registrations
- Understand their progress visually
- Recover from errors gracefully
- Use their preferred registration method based on their situation

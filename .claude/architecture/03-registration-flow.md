# Registration Flow

Step-based registration system with three methods.

---

## Three Registration Methods

| Method         | Description                           | Use Case                           |
| -------------- | ------------------------------------- | ---------------------------------- |
| **Standard**   | Sign and pay from same wallet         | Wallet compromised but accessible  |
| **Self-Relay** | Sign with stolen, pay with gas wallet | Wallet drained, has another wallet |
| **P2P Relay**  | Sign with stolen, helper pays via P2P | Wallet completely compromised      |

All methods follow: **Acknowledgement → Grace Period → Registration**

---

## Step Sequences

```typescript
// apps/web/src/stores/registrationStore.ts

export const STEP_SEQUENCES: Record<RegistrationType, RegistrationStep[]> = {
  standard: [
    'acknowledge-and-sign', // Sign ACK
    'acknowledge-and-pay', // Submit ACK tx
    'grace-period', // Wait ~1-4 min
    'register-and-sign', // Sign REG
    'register-and-pay', // Submit REG tx
    'success',
  ],

  selfRelay: [
    'acknowledge-and-sign', // Sign ACK (stolen wallet)
    'switch-and-pay-one', // Switch to gas wallet, submit ACK
    'grace-period', // Wait
    'register-and-sign', // Switch back, sign REG (stolen)
    'switch-and-pay-two', // Switch to gas, submit REG
    'success',
  ],

  p2pRelay: [
    'wait-for-connection', // P2P peer connect
    'acknowledge-and-sign', // Sign ACK
    'acknowledgement-payment', // Wait for helper's ACK tx
    'grace-period', // Wait
    'register-and-sign', // Sign REG
    'registration-payment', // Wait for helper's REG tx
    'success',
  ],
};
```

---

## Flow Diagram (Standard)

```
acknowledge-and-sign → acknowledge-and-pay → grace-period
                                                   ↓
success ← register-and-pay ← register-and-sign ←──┘
```

## Flow Diagram (Self-Relay)

```
          [Stolen Wallet]              [Gas Wallet]
acknowledge-and-sign ──────→ switch-and-pay-one ──→ grace-period
                                                          ↓
success ← switch-and-pay-two ←── register-and-sign ←─────┘
          [Gas Wallet]               [Stolen Wallet]
```

---

## File Structure

```
src/
├── pages/
│   ├── StandardRegistrationPage.tsx
│   ├── SelfRelayRegistrationPage.tsx
│   ├── P2PRegistereeRegistrationPage.tsx
│   └── P2PRelayerRegistrationPage.tsx
│
├── components/registration/
│   ├── StepRenderer.tsx              # Step → component mapping
│   └── steps/
│       ├── InitialFormStep.tsx       # Form + ACK signing
│       ├── AcknowledgementPayStep.tsx
│       ├── GracePeriodStep.tsx
│       ├── RegistrationSignStep.tsx
│       ├── RegistrationPayStep.tsx
│       ├── SuccessStep.tsx
│       └── P2P*.tsx                  # P2P-specific steps
│
├── stores/
│   ├── registrationStore.ts          # Step state, tx hashes
│   └── formStore.ts                  # Form values
│
└── hooks/
    └── useStepNavigation.ts          # goToNextStep, resetFlow
```

---

## StepRenderer

Maps step identifiers to components:

```typescript
// apps/web/src/components/registration/StepRenderer.tsx

const stepComponents: Record<RegistrationStep, ReactNode> = {
  'acknowledge-and-sign': <InitialFormStep onComplete={onStepComplete} />,
  'acknowledge-and-pay': <AcknowledgementPayStep onComplete={onStepComplete} />,
  'switch-and-pay-one': <AcknowledgementPayStep onComplete={onStepComplete} />,
  'grace-period': <GracePeriodStep onComplete={onStepComplete} />,
  'register-and-sign': <RegistrationSignStep onComplete={onStepComplete} />,
  'register-and-pay': <RegistrationPayStep onComplete={onStepComplete} />,
  'switch-and-pay-two': <RegistrationPayStep onComplete={onStepComplete} />,
  'success': <SuccessStep />,
  // P2P steps...
};
```

**Note:** Some steps share components. The component checks `registrationType` to show `WalletSwitchPrompt` for self-relay.

---

## Wallet Requirements Per Step

| Step                   | Standard   | Self-Relay     | P2P        |
| ---------------------- | ---------- | -------------- | ---------- |
| `acknowledge-and-sign` | Registeree | Registeree     | Registeree |
| `acknowledge-and-pay`  | Registeree | —              | —          |
| `switch-and-pay-one`   | —          | **Gas Wallet** | —          |
| `register-and-sign`    | Registeree | Registeree     | Registeree |
| `register-and-pay`     | Registeree | —              | —          |
| `switch-and-pay-two`   | —          | **Gas Wallet** | —          |

---

## Navigation Hook

```typescript
// apps/web/src/hooks/useStepNavigation.ts

export function useStepNavigation() {
  const { step, setStep, reset: resetRegistration } = useRegistrationStore();
  const { reset: resetForm } = useFormStore();

  const goToNextStep = () => {
    const nextStep = getNextStep(registrationType, step);
    if (nextStep) setStep(nextStep);
  };

  const resetFlow = () => {
    resetRegistration();
    resetForm();
    clearAllSignatures();
  };

  return { currentStep: step, goToNextStep, goToPreviousStep, resetFlow };
}
```

---

## Form Validation

```typescript
// apps/web/src/lib/schemas/registration.ts

export const initialFormSchema = z.object({
  registeree: ethereumAddressSchema, // Required
  relayer: optionalEthereumAddressSchema, // Optional (self-relay only)
  supportNFT: z.boolean(),
  walletNFT: z.boolean(),
});
```

---

## State Persistence

Both stores persist to localStorage:

- `swr-registration-state` - Current step, tx hashes
- `swr-form-state` - Form values

Users can resume interrupted registrations on page refresh.

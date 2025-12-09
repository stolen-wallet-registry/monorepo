import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

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

const initialState: RegistrationState = {
  registrationType: 'standard',
  step: null,
  acknowledgementHash: null,
  registrationHash: null,
};

export const useRegistrationStore = create<RegistrationState & RegistrationActions>()(
  persist(
    immer((set) => ({
      ...initialState,

      setRegistrationType: (type) =>
        set((state) => {
          state.registrationType = type;
          state.step = getInitialStep(type);
        }),

      setStep: (step) =>
        set((state) => {
          state.step = step;
        }),

      setAcknowledgementHash: (hash) =>
        set((state) => {
          state.acknowledgementHash = hash;
        }),

      setRegistrationHash: (hash) =>
        set((state) => {
          state.registrationHash = hash;
        }),

      reset: () => set(initialState),
    })),
    {
      name: 'registration-state',
    }
  )
);

function getInitialStep(type: RegistrationType): RegistrationStep {
  switch (type) {
    case 'standard':
    case 'selfRelay':
      return 'acknowledge-and-sign';
    case 'p2pRelay':
      return 'wait-for-connection';
  }
}

// Step sequences for each registration type
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

// Helper to get next step
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

// Helper to get previous step
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

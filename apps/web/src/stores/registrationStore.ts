import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { logger } from '@/lib/logger';
import type { Hash } from '@/lib/types/ethereum';

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
  acknowledgementHash: Hash | null;
  /** Chain ID where acknowledgement was submitted */
  acknowledgementChainId: number | null;
  registrationHash: Hash | null;
  /** Chain ID where registration was submitted (spoke chain for cross-chain) */
  registrationChainId: number | null;
  /** Cross-chain bridge message ID (e.g., Hyperlane messageId) */
  bridgeMessageId: Hash | null;
}

export interface RegistrationActions {
  setRegistrationType: (type: RegistrationType) => void;
  setStep: (step: RegistrationStep) => void;
  setAcknowledgementHash: (hash: Hash, chainId: number) => void;
  setRegistrationHash: (hash: Hash, chainId: number) => void;
  setBridgeMessageId: (messageId: Hash) => void;
  reset: () => void;
}

const initialState: RegistrationState = {
  registrationType: 'standard',
  step: null,
  acknowledgementHash: null,
  acknowledgementChainId: null,
  registrationHash: null,
  registrationChainId: null,
  bridgeMessageId: null,
};

export const useRegistrationStore = create<RegistrationState & RegistrationActions>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

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

        setAcknowledgementHash: (hash, chainId) =>
          set((state) => {
            logger.acknowledgement.info('Acknowledgement hash received', { hash, chainId });
            state.acknowledgementHash = hash;
            state.acknowledgementChainId = chainId;
          }),

        setRegistrationHash: (hash, chainId) =>
          set((state) => {
            logger.registration.info('Registration hash received', { hash, chainId });
            state.registrationHash = hash;
            state.registrationChainId = chainId;
          }),

        setBridgeMessageId: (messageId) =>
          set((state) => {
            logger.registration.info('Bridge message ID received', { messageId });
            state.bridgeMessageId = messageId;
          }),

        reset: () => {
          logger.registration.info('Registration state reset');
          set(initialState);
        },
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
            acknowledgementChainId:
              state.acknowledgementChainId ?? initialState.acknowledgementChainId,
            registrationHash: state.registrationHash ?? initialState.registrationHash,
            registrationChainId: state.registrationChainId ?? initialState.registrationChainId,
            bridgeMessageId: state.bridgeMessageId ?? initialState.bridgeMessageId,
          };
        },
      }
    ),
    { name: 'RegistrationStore', enabled: process.env.NODE_ENV === 'development' }
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

// ============================================================================
// Selectors - Use these for granular subscriptions to prevent unnecessary re-renders
// ============================================================================

/**
 * Select registration type and setter.
 * Use when component only needs to read/change the registration type.
 */
export const useRegistrationType = () =>
  useRegistrationStore(
    useShallow((s) => ({
      registrationType: s.registrationType,
      setRegistrationType: s.setRegistrationType,
    }))
  );

/**
 * Select current step and setter.
 * Use when component only needs to manage the current step.
 */
export const useRegistrationStep = () =>
  useRegistrationStore(
    useShallow((s) => ({
      step: s.step,
      setStep: s.setStep,
    }))
  );

/**
 * Select transaction hashes, chain IDs, and bridge message ID.
 * Use when component needs acknowledgement, registration, and cross-chain info.
 */
export const useRegistrationTxHashes = () =>
  useRegistrationStore(
    useShallow((s) => ({
      acknowledgementHash: s.acknowledgementHash,
      acknowledgementChainId: s.acknowledgementChainId,
      registrationHash: s.registrationHash,
      registrationChainId: s.registrationChainId,
      bridgeMessageId: s.bridgeMessageId,
      setAcknowledgementHash: s.setAcknowledgementHash,
      setRegistrationHash: s.setRegistrationHash,
      setBridgeMessageId: s.setBridgeMessageId,
    }))
  );

/**
 * Select full registration flow state (type + step).
 * Use when component needs to determine overall registration progress.
 */
export const useRegistrationFlow = () =>
  useRegistrationStore(
    useShallow((s) => ({
      registrationType: s.registrationType,
      step: s.step,
      setStep: s.setStep,
      reset: s.reset,
    }))
  );

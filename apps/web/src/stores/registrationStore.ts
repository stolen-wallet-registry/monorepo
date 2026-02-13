import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { logger } from '@/lib/logger';
import type { Hash } from '@/lib/types/ethereum';
import type { RegistrationType, RegistrationStep } from '@/lib/types/registration';

export type { RegistrationType, RegistrationStep } from '@/lib/types/registration';

// BigInt-safe JSON storage for Zustand persist middleware
// JSON.stringify throws on BigInt - this provides custom serialization
const BIGINT_PREFIX = '__bigint__:';
const bigintStorage = createJSONStorage(() => localStorage, {
  replacer: (_key, value) => (typeof value === 'bigint' ? `${BIGINT_PREFIX}${value}` : value),
  reviver: (_key, value) =>
    typeof value === 'string' && value.startsWith(BIGINT_PREFIX)
      ? BigInt(value.slice(BIGINT_PREFIX.length))
      : value,
});

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
  /** Raw EVM chain ID where incident occurred (e.g., 1 for mainnet, 8453 for Base) */
  reportedChainId: bigint | null;
  /** Unix timestamp when incident occurred (user-provided) */
  incidentTimestamp: bigint | null;
}

export interface RegistrationActions {
  setRegistrationType: (type: RegistrationType) => void;
  setStep: (step: RegistrationStep) => void;
  setAcknowledgementHash: (hash: Hash, chainId: number) => void;
  setRegistrationHash: (hash: Hash, chainId: number) => void;
  setBridgeMessageId: (messageId: Hash) => void;
  setReportedChainId: (chainId: bigint) => void;
  setIncidentTimestamp: (timestamp: bigint) => void;
  /** Initialize incident fields with defaults based on current chain */
  initializeFields: (chainId: number, timestamp?: bigint) => void;
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
  reportedChainId: null,
  incidentTimestamp: null,
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
            const allowedSteps = STEP_SEQUENCES[state.registrationType];
            if (!allowedSteps.includes(step)) {
              logger.registration.warn('Attempted to set invalid step for registration type', {
                registrationType: state.registrationType,
                attemptedStep: step,
                allowedSteps,
              });
              return;
            }
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

        setReportedChainId: (chainId) =>
          set((state) => {
            logger.registration.info('Reported chain ID set', { chainId });
            state.reportedChainId = chainId;
          }),

        setIncidentTimestamp: (timestamp) =>
          set((state) => {
            logger.registration.info('Incident timestamp set', {
              timestamp: timestamp.toString(),
            });
            state.incidentTimestamp = timestamp;
          }),

        initializeFields: (chainId, timestamp) =>
          set((state) => {
            // Store raw numeric chain ID - contracts accept uint64
            // The contract converts to CAIP-2 bytes32 hash internally
            const reportedChainId = BigInt(chainId);
            // Default incidentTimestamp to now if not provided
            const incidentTimestamp = timestamp ?? 0n; // TODO: Add incident timestamp selection UI

            logger.registration.info('Fields initialized', {
              chainId,
              reportedChainId: reportedChainId.toString(),
              incidentTimestamp: incidentTimestamp.toString(),
            });

            state.reportedChainId = reportedChainId;
            state.incidentTimestamp = incidentTimestamp;
          }),

        reset: () => {
          logger.registration.info('Registration state reset');
          set((state) => {
            Object.assign(state, initialState);
          });
        },
      })),
      {
        name: 'swr-registration-state',
        storage: bigintStorage, // BigInt-safe serialization for incidentTimestamp
        version: 2, // Bumped for incident fields
        migrate: (persisted, version) => {
          // Validate basic shape
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }

          const state = persisted as Partial<RegistrationState>;

          // Migration from v1 to v2: add incident fields
          if (version < 2) {
            logger.registration.info('Migrating registration state from v1 to v2');
          }

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
            // Incident fields (null if migrating from v1)
            reportedChainId: state.reportedChainId ?? initialState.reportedChainId,
            incidentTimestamp: state.incidentTimestamp ?? initialState.incidentTimestamp,
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
  return sequence[currentIndex + 1] ?? null;
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
  return sequence[currentIndex - 1] ?? null;
}

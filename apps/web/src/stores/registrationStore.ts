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
/**
 * A prefixed value whose suffix is not a valid integer literal.
 *
 * `BigInt('abc')` throws a SyntaxError, and the reviver runs INSIDE `JSON.parse`, so an
 * unguarded conversion made `getItem` throw for the whole blob. This is the only store with a
 * custom storage, so it is the only one whose hydration can fail before its validating `merge`
 * ever runs — the user mid-flow silently lost `step`, both transaction hashes and both incident
 * fields with a paid acknowledgement live on chain. Returning the raw string instead lets
 * `merge` see a non-bigint where a bigint belongs and substitute the initial value.
 */
const BIGINT_SUFFIX = /^-?\d+$/;
const bigintStorage = createJSONStorage(() => localStorage, {
  replacer: (_key, value) => (typeof value === 'bigint' ? `${BIGINT_PREFIX}${value}` : value),
  reviver: (_key, value) => {
    if (typeof value !== 'string' || !value.startsWith(BIGINT_PREFIX)) {
      return value;
    }
    const suffix = value.slice(BIGINT_PREFIX.length);
    return BIGINT_SUFFIX.test(suffix) ? BigInt(suffix) : value;
  },
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

const VALID_REGISTRATION_TYPES: RegistrationType[] = ['standard', 'selfRelay', 'p2pRelay'];

// MUST be declared BEFORE the create() call below. zustand's persist middleware hydrates
// synchronously for localStorage, so `merge` runs during module evaluation — a reference to
// a `const` declared later in the file throws a temporal-dead-zone ReferenceError, which
// zustand silently swallows, and the store NEVER rehydrates persisted state.
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
        version: 1,
        // There is no released version of this app, so nothing needs a real version
        // transform — any older blob is simply discarded. `migrate` still has to exist:
        // without it, zustand hits a version mismatch, console.errors, and never marks the
        // load as migrated, so it never rewrites the entry and the error repeats on every
        // single reload for anyone holding state from an earlier local version.
        migrate: () => initialState,
        // Validation lives in `merge`, not `migrate`: zustand only calls `migrate` on a
        // version mismatch, so validation placed there never runs on a normal reload.
        // `merge` runs on EVERY rehydrate and supplies a default for every field.
        merge: (persisted, current) => {
          // Validate basic shape
          if (!persisted || typeof persisted !== 'object') {
            return current;
          }

          const state = persisted as Partial<RegistrationState>;

          // Validate registrationType and step against the known sequences (mirrors
          // transactionRegistrationStore). An unknown step would otherwise flow into
          // StepRenderer's Record lookup and render a blank page with no recovery control.
          const isValidRegistrationType =
            state.registrationType &&
            VALID_REGISTRATION_TYPES.includes(state.registrationType as RegistrationType);
          const finalRegistrationType = isValidRegistrationType
            ? (state.registrationType as RegistrationType)
            : initialState.registrationType;
          const validSteps = STEP_SEQUENCES[finalRegistrationType];
          const isValidStep =
            state.step === null ||
            (state.step && validSteps.includes(state.step as RegistrationStep));

          // Ensure all required fields exist with fallbacks
          return {
            ...current,
            registrationType: finalRegistrationType,
            step: isValidStep ? (state.step as RegistrationStep | null) : initialState.step,
            acknowledgementHash: state.acknowledgementHash ?? initialState.acknowledgementHash,
            acknowledgementChainId:
              state.acknowledgementChainId ?? initialState.acknowledgementChainId,
            registrationHash: state.registrationHash ?? initialState.registrationHash,
            registrationChainId: state.registrationChainId ?? initialState.registrationChainId,
            bridgeMessageId: state.bridgeMessageId ?? initialState.bridgeMessageId,
            // Incident fields (null if migrating from v1).
            //
            // Type-checked, not merely defaulted: the bigint reviver hands back the raw string
            // for a corrupt `__bigint__:` value rather than letting `BigInt()` throw out of
            // `JSON.parse` and take the whole rehydrate with it. That leaves a string sitting
            // where a bigint belongs, which would reach `useAcknowledgement` as a contract
            // argument. This is where it gets dropped.
            reportedChainId:
              typeof state.reportedChainId === 'bigint'
                ? state.reportedChainId
                : initialState.reportedChainId,
            incidentTimestamp:
              typeof state.incidentTimestamp === 'bigint'
                ? state.incidentTimestamp
                : initialState.incidentTimestamp,
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

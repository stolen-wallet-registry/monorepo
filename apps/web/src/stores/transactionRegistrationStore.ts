/**
 * Store for transaction registration flow state.
 * Mirrors registrationStore.ts pattern for transaction batches.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { logger } from '@/lib/logger';
import type { Hash } from '@/lib/types/ethereum';

export type TransactionRegistrationType = 'standard' | 'selfRelay' | 'p2pRelay';

export type TransactionRegistrationStep =
  | 'select-transactions'
  | 'acknowledge-sign'
  | 'acknowledge-pay'
  | 'switch-and-pay-ack'
  | 'wait-for-connection'
  | 'acknowledgement-payment'
  | 'grace-period'
  | 'register-sign'
  | 'register-pay'
  | 'switch-and-pay-reg'
  | 'registration-payment'
  | 'success';

export interface TransactionRegistrationState {
  registrationType: TransactionRegistrationType;
  step: TransactionRegistrationStep | null;
  acknowledgementHash: Hash | null;
  acknowledgementChainId: number | null;
  registrationHash: Hash | null;
  registrationChainId: number | null;
  bridgeMessageId: Hash | null;
}

export interface TransactionRegistrationActions {
  setRegistrationType: (type: TransactionRegistrationType) => void;
  setStep: (step: TransactionRegistrationStep) => void;
  setAcknowledgementHash: (hash: Hash, chainId: number) => void;
  setRegistrationHash: (hash: Hash, chainId: number) => void;
  setBridgeMessageId: (messageId: Hash) => void;
  reset: () => void;
}

const initialState: TransactionRegistrationState = {
  registrationType: 'standard',
  step: null,
  acknowledgementHash: null,
  acknowledgementChainId: null,
  registrationHash: null,
  registrationChainId: null,
  bridgeMessageId: null,
};

export const useTransactionRegistrationStore = create<
  TransactionRegistrationState & TransactionRegistrationActions
>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setRegistrationType: (type) =>
          set((state) => {
            logger.registration.info('Transaction registration type selected', {
              type,
              initialStep: getInitialStep(type),
            });
            state.registrationType = type;
            state.step = getInitialStep(type);
          }),

        setStep: (step) =>
          set((state) => {
            logger.registration.info('Transaction step transition', { from: state.step, to: step });
            state.step = step;
          }),

        setAcknowledgementHash: (hash, chainId) =>
          set((state) => {
            logger.registration.info('Transaction acknowledgement hash received', {
              hash,
              chainId,
            });
            state.acknowledgementHash = hash;
            state.acknowledgementChainId = chainId;
          }),

        setRegistrationHash: (hash, chainId) =>
          set((state) => {
            logger.registration.info('Transaction registration hash received', { hash, chainId });
            state.registrationHash = hash;
            state.registrationChainId = chainId;
          }),

        setBridgeMessageId: (messageId) =>
          set((state) => {
            logger.registration.info('Transaction bridge message ID received', { messageId });
            state.bridgeMessageId = messageId;
          }),

        reset: () => {
          logger.registration.info('Transaction registration state reset');
          set(initialState);
        },
      })),
      {
        name: 'swr-transaction-registration-state',
        version: 1,
        migrate: (persisted) => {
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }
          const state = persisted as Partial<TransactionRegistrationState>;
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
    { name: 'TransactionRegistrationStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

function getInitialStep(type: TransactionRegistrationType): TransactionRegistrationStep {
  switch (type) {
    case 'standard':
    case 'selfRelay':
      return 'select-transactions';
    case 'p2pRelay':
      return 'wait-for-connection';
  }
}

export const TX_STEP_SEQUENCES: Record<TransactionRegistrationType, TransactionRegistrationStep[]> =
  {
    standard: [
      'select-transactions',
      'acknowledge-sign',
      'acknowledge-pay',
      'grace-period',
      'register-sign',
      'register-pay',
      'success',
    ],
    selfRelay: [
      'select-transactions',
      'acknowledge-sign',
      'switch-and-pay-ack',
      'grace-period',
      'register-sign',
      'switch-and-pay-reg',
      'success',
    ],
    p2pRelay: [
      'wait-for-connection',
      'select-transactions',
      'acknowledge-sign',
      'acknowledgement-payment',
      'grace-period',
      'register-sign',
      'registration-payment',
      'success',
    ],
  };

export function getTxNextStep(
  type: TransactionRegistrationType,
  currentStep: TransactionRegistrationStep
): TransactionRegistrationStep | null {
  const sequence = TX_STEP_SEQUENCES[type];
  const currentIndex = sequence.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) {
    return null;
  }
  return sequence[currentIndex + 1];
}

export function getTxPreviousStep(
  type: TransactionRegistrationType,
  currentStep: TransactionRegistrationStep
): TransactionRegistrationStep | null {
  const sequence = TX_STEP_SEQUENCES[type];
  const currentIndex = sequence.indexOf(currentStep);
  if (currentIndex <= 0) {
    return null;
  }
  return sequence[currentIndex - 1];
}

// Selectors
export const useTransactionRegistrationType = () =>
  useTransactionRegistrationStore(
    useShallow((s) => ({
      registrationType: s.registrationType,
      setRegistrationType: s.setRegistrationType,
    }))
  );

export const useTransactionRegistrationStep = () =>
  useTransactionRegistrationStore(
    useShallow((s) => ({
      step: s.step,
      setStep: s.setStep,
    }))
  );

export const useTransactionRegistrationTxHashes = () =>
  useTransactionRegistrationStore(
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

export const useTransactionRegistrationFlow = () =>
  useTransactionRegistrationStore(
    useShallow((s) => ({
      registrationType: s.registrationType,
      step: s.step,
      setStep: s.setStep,
      reset: s.reset,
    }))
  );

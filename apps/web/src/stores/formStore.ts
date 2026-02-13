import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isAddress } from 'viem';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export interface FormState {
  registeree: Address | null;
  relayer: Address | null;
}

export interface FormActions {
  setRegisteree: (address: Address) => void;
  setRelayer: (address: Address) => void;
  setFormValues: (values: Partial<FormState>) => void;
  reset: () => void;
}

const initialState: FormState = {
  registeree: null,
  relayer: null,
};

export const useFormStore = create<FormState & FormActions>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setRegisteree: (address) =>
          set((state) => {
            logger.store.debug('Form registeree updated', { address });
            state.registeree = address;
          }),

        setRelayer: (address) =>
          set((state) => {
            logger.store.debug('Form relayer updated', { address });
            state.relayer = address;
          }),

        setFormValues: (values) =>
          set((state) => {
            logger.store.debug('Form values batch updated', { values });
            Object.assign(state, values);
          }),

        reset: () => {
          logger.store.debug('Form state reset');
          set(() => ({ ...initialState }));
        },
      })),
      {
        name: 'swr-form-state',
        version: 1,
        migrate: (persisted) => {
          // Validate basic shape
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }

          const state = persisted as Partial<FormState>;

          // Validate addresses are properly formatted before restoring
          // Corrupted localStorage data could cause type safety issues
          const validRegisteree =
            state.registeree && isAddress(state.registeree)
              ? (state.registeree as Address)
              : initialState.registeree;
          const validRelayer =
            state.relayer && isAddress(state.relayer)
              ? (state.relayer as Address)
              : initialState.relayer;

          // Ensure all required fields exist with fallbacks
          return {
            registeree: validRegisteree,
            relayer: validRelayer,
          };
        },
      }
    ),
    { name: 'FormStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

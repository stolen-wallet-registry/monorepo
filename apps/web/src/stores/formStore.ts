import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { logger } from '@/lib/logger';

export interface FormState {
  registeree: `0x${string}` | null;
  relayer: `0x${string}` | null;
  supportNFT: boolean;
  walletNFT: boolean;
}

export interface FormActions {
  setRegisteree: (address: `0x${string}`) => void;
  setRelayer: (address: `0x${string}`) => void;
  setSupportNFT: (value: boolean) => void;
  setWalletNFT: (value: boolean) => void;
  setFormValues: (values: Partial<FormState>) => void;
  reset: () => void;
}

const initialState: FormState = {
  registeree: null,
  relayer: null,
  supportNFT: false,
  walletNFT: false,
};

export const useFormStore = create<FormState & FormActions>()(
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

      setSupportNFT: (value) =>
        set((state) => {
          logger.store.debug('Form supportNFT updated', { value });
          state.supportNFT = value;
        }),

      setWalletNFT: (value) =>
        set((state) => {
          logger.store.debug('Form walletNFT updated', { value });
          state.walletNFT = value;
        }),

      setFormValues: (values) =>
        set((state) => {
          logger.store.debug('Form values batch updated', { values });
          Object.assign(state, values);
        }),

      reset: () => {
        logger.store.debug('Form state reset');
        set(initialState);
      },
    })),
    {
      name: 'swr-form-state',
      version: 1,
      migrate: (persisted, version) => {
        // Future migrations can be added here
        if (version === 0) {
          // Migration from unversioned to v1 - no changes needed
        }
        return persisted as FormState & FormActions;
      },
    }
  )
);

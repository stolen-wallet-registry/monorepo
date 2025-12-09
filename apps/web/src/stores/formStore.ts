import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

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
          state.registeree = address;
        }),

      setRelayer: (address) =>
        set((state) => {
          state.relayer = address;
        }),

      setSupportNFT: (value) =>
        set((state) => {
          state.supportNFT = value;
        }),

      setWalletNFT: (value) =>
        set((state) => {
          state.walletNFT = value;
        }),

      setFormValues: (values) =>
        set((state) => {
          Object.assign(state, values);
        }),

      reset: () => set(initialState),
    })),
    {
      name: 'form-state',
    }
  )
);

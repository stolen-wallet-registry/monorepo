import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
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
        migrate: (persisted) => {
          // Validate basic shape
          if (!persisted || typeof persisted !== 'object') {
            return initialState;
          }

          const state = persisted as Partial<FormState>;

          // Ensure all required fields exist with fallbacks
          return {
            registeree: state.registeree ?? initialState.registeree,
            relayer: state.relayer ?? initialState.relayer,
            supportNFT: state.supportNFT ?? initialState.supportNFT,
            walletNFT: state.walletNFT ?? initialState.walletNFT,
          };
        },
      }
    ),
    { name: 'FormStore', enabled: process.env.NODE_ENV === 'development' }
  )
);

// ============================================================================
// Selectors - Use these for granular subscriptions to prevent unnecessary re-renders
// ============================================================================

/**
 * Select wallet addresses (registeree and relayer).
 * Use when component needs to display or compare addresses.
 */
export const useFormAddresses = () =>
  useFormStore(
    useShallow((s) => ({
      registeree: s.registeree,
      relayer: s.relayer,
      setRegisteree: s.setRegisteree,
      setRelayer: s.setRelayer,
    }))
  );

/**
 * Select NFT options.
 * Use when component manages NFT checkbox state.
 */
export const useFormNFTOptions = () =>
  useFormStore(
    useShallow((s) => ({
      supportNFT: s.supportNFT,
      walletNFT: s.walletNFT,
      setSupportNFT: s.setSupportNFT,
      setWalletNFT: s.setWalletNFT,
    }))
  );

/**
 * Select registeree only (read-only).
 * Use when component just needs to display the stolen wallet address.
 */
export const useRegisteree = () => useFormStore((s) => s.registeree);

/**
 * Select relayer only (read-only).
 * Use when component just needs to display the relayer address.
 */
export const useRelayer = () => useFormStore((s) => s.relayer);

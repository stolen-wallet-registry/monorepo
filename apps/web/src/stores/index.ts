import { useRegistrationStore } from './registrationStore';
import { useFormStore } from './formStore';
import { useP2PStore } from './p2pStore';

export {
  useRegistrationStore,
  type RegistrationState,
  type RegistrationActions,
  type RegistrationType,
  type RegistrationStep,
  STEP_SEQUENCES,
  getNextStep,
  getPreviousStep,
} from './registrationStore';

export { useFormStore, type FormState, type FormActions } from './formStore';

export { useP2PStore, type P2PState, type P2PActions } from './p2pStore';

// Utility to reset all stores at once
export function resetAllStores() {
  useRegistrationStore.getState().reset();
  useFormStore.getState().reset();
  useP2PStore.getState().reset();
}

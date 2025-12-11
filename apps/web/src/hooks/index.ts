// Contract read hooks
export {
  useContractDeadlines,
  type DeadlineData,
  type UseContractDeadlinesResult,
} from './useContractDeadlines';

export { useContractNonce, type UseContractNonceResult } from './useContractNonce';

export {
  useGenerateHashStruct,
  useAcknowledgementHashStruct,
  useRegistrationHashStruct,
  type HashStructData,
  type UseGenerateHashStructResult,
} from './useGenerateHashStruct';

// Contract write hooks
export {
  useAcknowledgement,
  type AcknowledgementParams,
  type UseAcknowledgementResult,
} from './useAcknowledgement';

export {
  useRegistration,
  type RegistrationParams,
  type UseRegistrationResult,
} from './useRegistration';

// Signing hooks
export { useSignEIP712, type SignParams, type UseSignEIP712Result } from './useSignEIP712';

// Timer hooks
export {
  useCountdownTimer,
  type UseCountdownTimerOptions,
  type UseCountdownTimerResult,
} from './useCountdownTimer';

// Navigation hooks
export { useStepNavigation, type UseStepNavigationResult } from './useStepNavigation';

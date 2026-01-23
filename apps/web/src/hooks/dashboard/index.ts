// Dashboard role hooks
export {
  useIsOperator,
  type UseIsOperatorOptions,
  type UseIsOperatorResult,
} from './useIsOperator';
export { useIsDAO, type UseIsDAOOptions, type UseIsDAOResult } from './useIsDAO';
export {
  useUserRole,
  type UserRole,
  type UseUserRoleOptions,
  type UseUserRoleResult,
} from './useUserRole';

// Dashboard data hooks
export {
  useRegistryStats,
  type RegistryStats,
  type UseRegistryStatsResult,
} from './useRegistryStats';
export {
  useOperators,
  type OperatorInfo,
  type UseOperatorsResult,
  CAPABILITY_WALLET,
  CAPABILITY_TX,
  CAPABILITY_CONTRACT,
} from './useOperators';
export {
  useRecentRegistrations,
  type RegistrationEntry,
  type RegistrationType,
  type UseRecentRegistrationsOptions,
  type UseRecentRegistrationsResult,
} from './useRecentRegistrations';

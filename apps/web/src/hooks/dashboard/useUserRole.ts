/**
 * Hook to determine the user's role in the dashboard.
 *
 * Combines isOperator and isDAO checks to return a single role.
 * Role hierarchy: DAO > Operator > Public
 */

import { useAccount } from 'wagmi';
import { useIsOperator, type UseIsOperatorOptions } from './useIsOperator';
import { useIsDAO, type UseIsDAOOptions } from './useIsDAO';

/** User role in the dashboard */
export type UserRole = 'dao' | 'operator' | 'public';

export interface UseUserRoleOptions extends UseIsOperatorOptions, UseIsDAOOptions {}

export interface UseUserRoleResult {
  /** The user's role */
  role: UserRole;
  /** Whether the user is the DAO owner */
  isDAO: boolean;
  /** Whether the user is an approved operator */
  isOperator: boolean;
  /** Whether the user has a wallet connected */
  isConnected: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Refetch both checks */
  refetch: () => void;
}

/**
 * Determine the user's role for dashboard access control.
 *
 * @example
 * ```tsx
 * const { role, isLoading } = useUserRole();
 *
 * if (role === 'dao') {
 *   // Show DAO management tab
 * } else if (role === 'operator') {
 *   // Show operator submit tab
 * }
 * ```
 */
export function useUserRole(options: UseUserRoleOptions = {}): UseUserRoleResult {
  const { isConnected } = useAccount();

  const {
    isDAO,
    isLoading: isDAOLoading,
    isError: isDAOError,
    refetch: refetchDAO,
  } = useIsDAO(options);

  const {
    isOperator,
    isLoading: isOperatorLoading,
    isError: isOperatorError,
    refetch: refetchOperator,
  } = useIsOperator(options);

  // Determine role (DAO takes precedence over operator)
  let role: UserRole = 'public';
  if (isDAO) {
    role = 'dao';
  } else if (isOperator) {
    role = 'operator';
  }

  const refetch = () => {
    refetchDAO();
    refetchOperator();
  };

  return {
    role,
    isDAO,
    isOperator,
    isConnected,
    isLoading: isDAOLoading || isOperatorLoading,
    isError: isDAOError || isOperatorError,
    refetch,
  };
}

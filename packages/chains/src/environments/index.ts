/**
 * Environment-based chain selection.
 *
 * Maps deployment environments to their chain configurations.
 */

import type { Environment, NetworkConfig } from '../types';
import { anvilHub, anvilSpoke, base, baseSepolia, optimism, optimismSepolia } from '../networks';

/**
 * Chain IDs by environment.
 */
export const environmentChainIds: Record<Environment, readonly number[]> = {
  development: [anvilHub.chainId, anvilSpoke.chainId],
  staging: [baseSepolia.chainId, optimismSepolia.chainId],
  production: [base.chainId, optimism.chainId],
} as const;

/**
 * Hub chain IDs by environment.
 */
export const hubChainIds: Record<Environment, number> = {
  development: anvilHub.chainId,
  staging: baseSepolia.chainId,
  production: base.chainId,
} as const;

/**
 * Network configurations by environment.
 */
export const environmentNetworks: Record<Environment, readonly NetworkConfig[]> = {
  development: [anvilHub, anvilSpoke],
  staging: [baseSepolia, optimismSepolia],
  production: [base, optimism],
} as const;

/**
 * Get chain IDs for an environment.
 */
export function getEnvironmentChainIds(env: Environment): readonly number[] {
  return environmentChainIds[env];
}

/**
 * Get the hub chain ID for an environment.
 */
export function getHubChainIdForEnvironment(env: Environment): number {
  return hubChainIds[env];
}

/**
 * Get network configurations for an environment.
 */
export function getEnvironmentNetworks(env: Environment): readonly NetworkConfig[] {
  return environmentNetworks[env];
}

/**
 * Detect environment from chain ID.
 *
 * @param chainId - A chain ID currently in use
 * @returns The environment, or undefined if not recognized
 */
export function detectEnvironmentFromChainId(chainId: number): Environment | undefined {
  const entries = Object.entries(environmentChainIds) as [Environment, readonly number[]][];
  for (const [env, ids] of entries) {
    if (ids.includes(chainId)) {
      return env;
    }
  }
  return undefined;
}

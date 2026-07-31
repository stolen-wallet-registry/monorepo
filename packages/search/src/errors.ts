/**
 * Search error types.
 */

import type { RegistryKind, UnverifiedRegistries } from './types';

/**
 * Thrown when a search cannot establish whether an identifier is registered.
 *
 * This is deliberately an exception rather than a returned value. The alternative — returning
 * `found: false` alongside a `degraded: true` flag — puts the safe reading of the result in
 * the caller's hands, and the unsafe reading (`if (!result.found) allow()`) is both shorter
 * and the one integrators already wrote. For a fraud registry that trade is unacceptable: a
 * cleared wallet that is actually registered stolen is the worst output this library can
 * produce. An exception cannot be read as "clean" by accident.
 *
 * Callers should surface "could not verify" and, where the decision matters (an off-ramp
 * clearing a withdrawal), fail closed.
 *
 * Note this is only thrown when NOTHING was found. A search that finds a hit returns
 * normally with the unreachable registries listed in `unverified`, since a positive result
 * is still actionable.
 */
export class SearchUnavailableError extends Error {
  /** Registries that did not answer. */
  readonly unverified: UnverifiedRegistries;

  /** The underlying rejection(s), for logging. Never render these to a user. */
  readonly failures: readonly unknown[];

  constructor(unverified: UnverifiedRegistries, failures: readonly unknown[]) {
    const registries = unverified.length > 0 ? unverified.join(' and ') : 'registry';
    super(
      `Could not verify against the ${registries} registry — the indexer did not answer. ` +
        `This is NOT a clean result.`
    );
    this.name = 'SearchUnavailableError';
    this.unverified = unverified;
    this.failures = failures;
  }
}

/**
 * Narrow an unknown error to {@link SearchUnavailableError}.
 *
 * Prefer this over `instanceof` at package boundaries, where duplicate copies of the module
 * would break the prototype check.
 */
export function isSearchUnavailableError(error: unknown): error is SearchUnavailableError {
  return error instanceof Error && error.name === 'SearchUnavailableError';
}

/** Human-readable registry name for UI copy. */
export function registryKindLabel(kind: RegistryKind): string {
  switch (kind) {
    case 'wallet':
      return 'stolen wallet';
    case 'contract':
      return 'fraudulent contract';
    case 'transaction':
      return 'fraudulent transaction';
  }
}

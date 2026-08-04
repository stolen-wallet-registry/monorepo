/**
 * The single validated read of `PONDER_ENV`.
 *
 * `ponder.config.ts` and `src/index.ts` both need the environment, and they used to read it
 * independently: the config threw on an unrecognised value, the handlers cast it straight to
 * `Environment` and indexed a record with it. That only held because the config is loaded
 * first, so a typo failed there before the handlers ever ran — the handlers' own read was
 * wrong and merely unreachable. Its failure mode, had the load order ever changed, was
 * `HUB_CHAIN_ID === undefined` and a NOT NULL violation on the first cross-chain event, i.e.
 * an indexer that starts cleanly and dies later on a specific event.
 *
 * One helper, used by both, removes the load-order dependency.
 *
 * This file is imported by `ponder.config.ts`, which ponder loads before its own runtime is
 * available, so it must not import from `ponder:*`.
 */

import type { Environment } from '@swr/chains';

export const VALID_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

/**
 * Read and validate `PONDER_ENV`, defaulting to `development`.
 *
 * @param env - Environment object to read from (injectable for tests)
 * @throws when the value is set but not one of {@link VALID_ENVIRONMENTS}
 */
export function readPonderEnv(env: NodeJS.ProcessEnv = process.env): Environment {
  const raw = env.PONDER_ENV ?? 'development';

  if (!(VALID_ENVIRONMENTS as readonly string[]).includes(raw)) {
    throw new Error(
      `Invalid PONDER_ENV: "${raw}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
    );
  }

  return raw as Environment;
}

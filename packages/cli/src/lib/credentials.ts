import type { Hex } from 'viem';
import type { CliEnvironment } from './config.js';
import { loadKeystoreFile } from './keystore.js';
import { promptSecret } from './prompt.js';

/**
 * Operator signing-credential resolution.
 *
 * THREAT MODEL (security audit V7 — HIGH):
 * a private key passed on argv is world-readable on the operator host via `ps auxww` and
 * `/proc/<pid>/cmdline`, and additionally lands in shell history, CI job logs, `strace`
 * output and process-audit records. The compromised credential is a DAO-approved operator
 * identity, which permits permanent, unremovable on-chain marking of arbitrary third-party
 * addresses as stolen or fraudulent — the highest-value credential in the system.
 *
 * Policy:
 *   - `--private-key` (argv) is accepted ONLY for `-e local`, where the intended keys are
 *     Anvil's published, deliberately-public development defaults and the exposure is nil.
 *     On testnet/mainnet it is a hard error.
 *   - `--keystore` (encrypted V3 file + passphrase prompt) is accepted everywhere and is the
 *     recommended path for a hot operator key.
 *   - `OPERATOR_PRIVATE_KEY` (environment) is accepted everywhere but warned against on
 *     non-local networks: an environment variable is not world-readable the way argv is, but
 *     it is still a plaintext key in process memory and in whatever provisioned it.
 *   - `--build-only` needs no credential at all and is the recommended mainnet default.
 *
 * SECURITY: no function here logs the passphrase or the private key, on any path including
 * errors. Error strings interpolate only environment names and file paths.
 */

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Environments where a plaintext key on argv is acceptable (Anvil dev keys only). */
export function isLocalEnvironment(env: string): boolean {
  return env === 'local';
}

export interface CredentialSources {
  env: CliEnvironment;
  /** Value of `-k/--private-key`, i.e. read off argv. Subject to the local-only rule. */
  privateKeyArg?: string;
  /** Path passed to `--keystore`. */
  keystorePath?: string;
  /** Value of the OPERATOR_PRIVATE_KEY environment variable. */
  envPrivateKey?: string;
  /** Passphrase supplied non-interactively via SWR_KEYSTORE_PASSWORD. */
  envKeystorePassword?: string;
  /** True when no credential is needed at all. */
  buildOnly?: boolean;
  dryRun?: boolean;
  /** Injected for tests; defaults to the interactive TTY prompt. */
  promptPassphrase?: (question: string) => Promise<string>;
  /** Injected for tests; defaults to stderr. */
  warn?: (message: string) => void;
}

export interface ResolvedCredential {
  privateKey?: Hex;
  /** Where the key came from, for diagnostics. Never contains key material. */
  source: 'argv' | 'keystore' | 'env' | 'none';
}

export class CredentialError extends Error {}

function assertPrivateKeyShape(value: string, label: string): Hex {
  if (!PRIVATE_KEY_PATTERN.test(value)) {
    // Only the source label is echoed — never the value.
    throw new CredentialError(`${label} must be a 32-byte hex string with an 0x prefix.`);
  }
  return value as Hex;
}

/**
 * Reject argv-supplied private keys on any network where the key could be real.
 * Exported separately so `--help`-level validation and tests can exercise the rule alone.
 */
export function assertPrivateKeyArgAllowed(env: string): void {
  if (isLocalEnvironment(env)) return;

  throw new CredentialError(
    `--private-key is not permitted for -e ${env}. Process arguments are world-readable ` +
      '(ps, /proc/<pid>/cmdline, shell history, CI logs), so a real operator key passed this ' +
      'way must be treated as disclosed.\n' +
      '  Use --build-only and sign with your multisig (recommended for mainnet), or\n' +
      '  use --keystore <path> with an encrypted V3 keystore.\n' +
      '--private-key remains available for -e local, where the Anvil development keys are ' +
      'public by design.'
  );
}

/**
 * Resolve the operator signing key from the allowed sources, applying the V7 policy.
 *
 * Order: the argv refusal runs first (it is unconditional), then the credential-free
 * short circuit for --build-only/--dry-run, then --keystore > --private-key >
 * OPERATOR_PRIVATE_KEY.
 */
export async function resolveCredential(sources: CredentialSources): Promise<ResolvedCredential> {
  const {
    env,
    privateKeyArg,
    keystorePath,
    envPrivateKey,
    envKeystorePassword,
    buildOnly,
    dryRun,
    promptPassphrase = promptSecret,
    warn = (message: string) => console.error(message),
  } = sources;

  // The argv rule is enforced whenever the flag was passed at all — including alongside
  // --build-only/--dry-run — so an operator never gets a "that worked" signal for a habit
  // that leaks the key the moment they drop the flag.
  if (privateKeyArg !== undefined) {
    assertPrivateKeyArgAllowed(env);
  }

  // A mode that never signs must never hold a signing key. Checked BEFORE the keystore and
  // environment branches, not after them: decrypting for --build-only put a plaintext operator
  // key in process memory for a path that only ever emits calldata, and prompted for a
  // passphrase that could not possibly be needed. The argv rule above still runs first — -k on
  // mainnet has already leaked the key, and --build-only does not un-leak it.
  if (buildOnly || dryRun) {
    return { source: 'none' };
  }

  if (keystorePath) {
    // Truthiness, not `??`: an unset CI secret expands to the empty string, and treating that
    // as a supplied passphrase reports the generic wrong-passphrase failure instead of
    // prompting — sending the operator to look for a bad passphrase rather than a missing one.
    const passphrase =
      envKeystorePassword || (await promptPassphrase(`Passphrase for ${keystorePath}: `));
    // loadKeystoreFile never echoes the passphrase or the decrypted key.
    const privateKey = await loadKeystoreFile(keystorePath, passphrase);
    return {
      privateKey: assertPrivateKeyShape(privateKey, 'Keystore private key'),
      source: 'keystore',
    };
  }

  if (privateKeyArg !== undefined) {
    return {
      privateKey: assertPrivateKeyShape(privateKeyArg, '--private-key'),
      source: 'argv',
    };
  }

  if (envPrivateKey) {
    if (!isLocalEnvironment(env)) {
      warn(
        `Warning: using a plaintext OPERATOR_PRIVATE_KEY against ${env}. ` +
          'Prefer --keystore, or --build-only with a multisig.'
      );
    }
    return {
      privateKey: assertPrivateKeyShape(envPrivateKey, 'OPERATOR_PRIVATE_KEY'),
      source: 'env',
    };
  }

  throw new CredentialError(
    `No signing credential provided for -e ${env}.\n` +
      '  --build-only            build calldata for a multisig (recommended for mainnet)\n' +
      '  --keystore <path>       encrypted V3 keystore, passphrase prompted interactively\n' +
      '  OPERATOR_PRIVATE_KEY    plaintext key via the environment' +
      (isLocalEnvironment(env) ? '\n  --private-key <key>     local development only' : '')
  );
}

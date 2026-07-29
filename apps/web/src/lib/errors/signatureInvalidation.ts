/**
 * Classify a failed registry transaction as retryable or signature-invalidating.
 *
 * "Retry" on a pay step used to mean `reset()` — clear the wagmi write state and let the
 * user press the button again. For a gas-price or RPC failure that is exactly right. For a
 * revert that invalidates the signature itself (expired deadline, consumed nonce, expired
 * forwarder), it is a trap: the component re-reads the SAME signature out of sessionStorage
 * and rebuilds a byte-identical transaction, which reverts identically, forever, with no way
 * to re-sign. `removeSignature` was called from exactly one place in the whole app.
 *
 * So: retryable failures keep plain retry; signature-invalidating ones drop the stored
 * signature and send the user back to the sign step with an explanation.
 */

import { BaseError, ContractFunctionRevertedError } from 'viem';
import { CONTRACT_ERROR_MAP } from '@swr/errors';

/**
 * Error-name suffixes that mean the stored signature can never succeed.
 *
 * Matched on the suffix because every registry prefixes its own name
 * (`WalletRegistry__`, `TransactionRegistry__`, `SpokeRegistry__`) onto the same set of
 * conditions, and a new registry contract should inherit the classification for free.
 *
 * Deliberately NOT included: `AlreadyAcknowledged` / `AlreadyRegistered` (the work is done,
 * re-signing is not the answer), fee/quote errors, and anything about the caller's balance
 * or the chain — those are the retryable cases.
 */
const SIGNATURE_INVALIDATING_SUFFIXES = [
  'DeadlineExpired',
  'DeadlineInPast',
  'SignatureExpired',
  'ForwarderExpired',
  'InvalidNonce',
  'InvalidSignature',
  'InvalidForwarder',
] as const;

/**
 * Extract the Solidity error name from a thrown viem/wagmi error.
 *
 * Mirrors `decodeContractErrorFromError`'s two paths (ABI-decoded name, then raw selector),
 * but returns the name rather than the rendered user message.
 *
 * @returns the error name, or null if this is not a recognised contract revert
 */
export function getContractErrorName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;

  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return null;

  const errorName = revert.data?.errorName;
  if (errorName) return errorName;

  const selector = revert.signature ?? revert.raw?.slice(0, 10);
  if (selector) {
    const info = CONTRACT_ERROR_MAP[selector.toLowerCase()];
    if (info) return info.name;
  }

  return null;
}

/**
 * True when the revert means the stored signature is permanently unusable and the user must
 * sign again. Unrecognised errors return false — plain retry is the safer default, since a
 * wrongly-cleared signature costs the user a second signing prompt.
 *
 * @param error - The error thrown by viem/wagmi
 */
export function isSignatureInvalidatingError(error: unknown): boolean {
  const name = getContractErrorName(error);
  if (!name) return false;

  return SIGNATURE_INVALIDATING_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

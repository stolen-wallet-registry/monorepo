/**
 * Contract error decoding utilities.
 */

import { BaseError, ContractFunctionRevertedError, HttpRequestError, TimeoutError } from 'viem';
import { CONTRACT_ERROR_BY_NAME, CONTRACT_ERROR_MAP, type ContractErrorInfo } from './selectors';

/** viem error names that mean "the request never got an answer". */
const NETWORK_ERROR_NAMES = new Set(['HttpRequestError', 'TimeoutError']);

/** Render an error info entry as the single string shown to the user. */
function formatErrorInfo(info: ContractErrorInfo): string {
  return info.action ? `${info.message} ${info.action}` : info.message;
}

/**
 * Decode a contract custom error structurally from a thrown viem error.
 *
 * This is the primary decoding path. viem never emits the Hardhat/ethers phrasing
 * `"custom error 0x…"` that {@link decodeContractError} matches; it instead throws a
 * nested `ContractFunctionRevertedError` carrying either the ABI-decoded error name
 * (`cause.data.errorName`) or, when the error is absent from the ABI, the raw selector
 * (`cause.signature` / `cause.raw`). Matching on the error object rather than on its
 * rendered message is therefore the only reliable approach.
 *
 * @param error - The error thrown by viem/wagmi (any type; non-viem values return null)
 * @returns User-friendly message, or null if this is not a recognized contract revert
 */
export function decodeContractErrorFromError(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;

  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return null;

  // Preferred: viem decoded the revert against the ABI and gave us the Solidity error name.
  const errorName = revert.data?.errorName;
  if (errorName) {
    const byName = CONTRACT_ERROR_BY_NAME[errorName];
    if (byName) return formatErrorInfo(byName);
  }

  // Fallback: the error was not in the ABI, so viem only surfaces the raw selector.
  // `signature` is already the 4-byte selector; `raw` is the full revert data.
  const selector = revert.signature ?? revert.raw?.slice(0, 10);
  if (selector) {
    const bySelector = CONTRACT_ERROR_MAP[selector.toLowerCase()];
    if (bySelector) return formatErrorInfo(bySelector);
  }

  return null;
}

/**
 * Decode a contract custom error from an error message containing a hex selector.
 *
 * Extracts the 4-byte selector from patterns like "custom error 0xec5c97a6"
 * and returns a user-friendly message if the error is recognized.
 *
 * NOTE: this phrasing comes from Hardhat/ethers. viem does not produce it, so this is a
 * compatibility fallback only — prefer {@link decodeContractErrorFromError}, which matches
 * on the error object and is what actually fires for viem/wagmi reverts.
 *
 * @param errorMessage - The raw error message from viem/wagmi
 * @returns User-friendly error message, or null if not a recognized contract error
 *
 * @example
 * ```ts
 * const friendly = decodeContractError('Execution reverted: custom error 0xec5c97a6');
 * // Returns: "Your registration window has expired. Please start the registration process again from the beginning."
 * ```
 */
export function decodeContractError(errorMessage: string): string | null {
  // Match "custom error 0x" followed by 8 hex characters (4 bytes)
  const selectorMatch = errorMessage.match(/custom error (0x[a-fA-F0-9]{8})/i);
  if (!selectorMatch) return null;

  const selector = selectorMatch[1].toLowerCase();
  const errorInfo = CONTRACT_ERROR_MAP[selector];

  if (!errorInfo) {
    // Unknown contract error - return null to fall through to generic handling
    return null;
  }

  // Combine message and action into a single user-friendly string
  return errorInfo.action ? `${errorInfo.message} ${errorInfo.action}` : errorInfo.message;
}

/**
 * Get detailed error info for a known contract error selector.
 *
 * @param selector - The 4-byte hex selector (e.g., "0xec5c97a6")
 * @returns Error info object or undefined if not recognized
 */
export function getContractErrorInfo(selector: string): ContractErrorInfo | undefined {
  return CONTRACT_ERROR_MAP[selector.toLowerCase()];
}

/**
 * Sanitize error messages for user display.
 *
 * Handles known viem error types, contract custom errors, and strips
 * technical details from generic error messages.
 *
 * @param error - The error to sanitize (can be any type)
 * @param logError - Optional callback to log the original error (for debugging)
 * @returns User-friendly error message
 */
export function sanitizeErrorMessage(error: unknown, logError?: (error: unknown) => void): string {
  // Allow caller to handle logging (e.g., console.error in dev)
  logError?.(error);

  // A decoded contract revert is the most specific thing we can say, so try it first.
  const structuralError = decodeContractErrorFromError(error);
  if (structuralError) {
    return structuralError;
  }

  if (error instanceof BaseError) {
    // A network failure is nested inside a wrapper (viem puts HttpRequestError under
    // ContractFunctionExecutionError for contract calls), so matching on the top-level
    // name never fires and execution falls through to the tail sanitizer — which returns
    // the raw viem message including `URL:` and `Request body:`. That message is rendered
    // at ~20 UI sites, so a keyed RPC transport would put the API key in the DOM.
    // Walking the cause chain is what closes that path; see the V29 tests.
    // Matched by name as well as by instance: with duplicate viem copies in a pnpm workspace
    // an `instanceof` check silently fails, and this is the arm whose failure leaks the URL.
    const network = error.walk(
      (e) =>
        e instanceof HttpRequestError ||
        e instanceof TimeoutError ||
        (e instanceof Error && NETWORK_ERROR_NAMES.has(e.name))
    );
    if (network) {
      return 'Network error. Please check your connection and try again.';
    }

    switch (error.name) {
      case 'UserRejectedRequestError':
        return 'Transaction was cancelled. Please try again when ready.';
      case 'InsufficientFundsError':
        return 'Insufficient funds to complete this transaction.';
      case 'NonceTooLowError':
        return 'Transaction conflict detected. Please refresh and try again.';
    }
  }

  // Fallback to message-based detection
  const message = error instanceof Error ? error.message : String(error);

  // Try to decode contract custom errors (e.g., "custom error 0xec5c97a6")
  const decodedError = decodeContractError(message);
  if (decodedError) {
    return decodedError;
  }

  if (message.includes('User rejected') || message.includes('user rejected')) {
    return 'Transaction was cancelled. Please try again when ready.';
  }

  if (message.includes('insufficient funds')) {
    return 'Insufficient funds to complete this transaction.';
  }

  if (message.includes('nonce too low')) {
    return 'Transaction conflict detected. Please refresh and try again.';
  }

  if (message.includes('network') || message.includes('Network')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Strip version info (e.g., "Version: viem@2.41.2")
  let sanitized = message.replace(/\s*Version:\s*\S+/gi, '');

  // Strip the "Details:" clause.
  //
  // This used to be `/\s*Details:\s*[^.]+\./gi`, which failed two ways (audit V29 residual).
  // It stopped at the FIRST period, so `Details: request failed for https://x.io/v2/KEY. …`
  // stripped only as far as `io.` and rendered the rest — including whatever followed — into
  // the DOM. And requiring a trailing `.` meant a clause without one was not stripped at all.
  //
  // Now truncated to end-of-line, matching the reasoning already applied to `URL:` and
  // `Request body:` below: a partial match on a redaction target leaves fragments of exactly
  // the thing being redacted, so over-stripping is the correct failure direction. Anything
  // over-stripped falls through to the generic message via the length check at the end.
  //
  // End-of-LINE rather than end-of-string because viem puts `Version:` and
  // `Raw Call Arguments:` on their own following lines; those have their own rules, and
  // swallowing them here would make those rules untestable.
  sanitized = sanitized.replace(/\s*Details:[^\n]*/gi, '');

  // Strip "Raw Call Arguments:" section (contains long hex data that breaks UI)
  sanitized = sanitized.replace(/\s*Raw Call Arguments:[\s\S]*$/i, '');

  // Strip request details. `URL:` can carry an API key and `Request body:` carries JSON-RPC
  // calldata; neither belongs in a user-facing string. Both are truncated to end-of-string
  // rather than matched precisely, because a partial match on nested JSON braces would leave
  // fragments of exactly the thing being redacted.
  sanitized = sanitized.replace(/\s*URL:\s*\S+/gi, '');
  sanitized = sanitized.replace(/\s*Request body:[\s\S]*$/i, '');

  // Clean up any double spaces or trailing punctuation issues
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // If we stripped everything meaningful or got useless output like [object Object], provide a generic message
  if (!sanitized || sanitized.length < 10 || /^\[object .+\]$/.test(sanitized)) {
    return 'An unexpected error occurred. Please try again.';
  }

  return sanitized;
}

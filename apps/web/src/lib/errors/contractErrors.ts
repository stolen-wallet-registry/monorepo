/**
 * Contract custom error selectors mapped to user-friendly messages.
 *
 * When adding new errors to smart contracts:
 * 1. Define error in Solidity: `error MyContract__ErrorName();`
 * 2. Compute selector: `cast sig 'MyContract__ErrorName()'`
 * 3. Add entry to `contractErrors.json`
 * 4. Write clear, actionable message for users
 *
 * @see CLAUDE.md "Error Handling: Contract → Frontend" section
 */

import errorData from './contractErrors.json';

export interface ContractErrorInfo {
  /** Error name as defined in Solidity */
  name: string;
  /** User-friendly message explaining what went wrong */
  message: string;
  /** Optional action the user should take */
  action?: string;
}

/**
 * Map of error selectors (4-byte hex) to user-friendly error info.
 *
 * Selectors computed via: `cast sig 'ErrorName()'`
 * Keys are normalized to lowercase at load time to ensure case-insensitive lookups work.
 */
export const CONTRACT_ERROR_MAP: Record<string, ContractErrorInfo> = Object.fromEntries(
  Object.entries(errorData).map(([selector, info]) => [selector.toLowerCase(), info])
);

/**
 * Decode a contract custom error from an error message containing a hex selector.
 *
 * Extracts the 4-byte selector from patterns like "custom error 0xec5c97a6"
 * and returns a user-friendly message if the error is recognized.
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

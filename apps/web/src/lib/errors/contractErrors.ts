/**
 * Contract error handling utilities.
 *
 * Re-exports from shared package for consistent error handling.
 * See CLAUDE.md "Error Handling: Contract → Frontend" section for adding new errors.
 */

export {
  CONTRACT_ERROR_BY_NAME,
  CONTRACT_ERROR_MAP,
  CONTRACT_ERROR_SELECTORS,
  decodeContractError,
  decodeContractErrorFromError,
  getContractErrorInfo,
  type ContractErrorInfo,
} from '@swr/errors';

/**
 * Registration domain types shared across stores, hooks, and components.
 */

/** Shared registration method type — identical for wallet and transaction flows. */
export type RegistrationType = 'standard' | 'selfRelay' | 'p2pRelay';

/**
 * Wallet registration flow steps.
 * Uses "-and-" naming (e.g., "acknowledge-and-sign") because each step
 * combines signing and paying in a single user action.
 */
export type RegistrationStep =
  | 'acknowledge-and-sign'
  | 'acknowledge-and-pay'
  | 'switch-and-pay-one'
  | 'wait-for-connection'
  | 'acknowledgement-payment'
  | 'grace-period'
  | 'register-and-sign'
  | 'register-and-pay'
  | 'switch-and-pay-two'
  | 'registration-payment'
  | 'success';

/** @deprecated Use RegistrationType instead — kept as alias for backward compatibility. */
export type TransactionRegistrationType = RegistrationType;

/**
 * Transaction registration flow steps.
 * Uses shorter naming (e.g., "acknowledge-sign") because the flow has an
 * extra "select-transactions" step, making brevity more important.
 */
export type TransactionRegistrationStep =
  | 'select-transactions'
  | 'acknowledge-sign'
  | 'acknowledge-pay'
  | 'switch-and-pay-ack'
  | 'wait-for-connection'
  | 'acknowledgement-payment'
  | 'grace-period'
  | 'register-sign'
  | 'register-pay'
  | 'switch-and-pay-reg'
  | 'registration-payment'
  | 'success';

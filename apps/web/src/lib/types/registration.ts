/**
 * Registration domain types shared across stores, hooks, and components.
 */

export type RegistrationType = 'standard' | 'selfRelay' | 'p2pRelay';

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

export type TransactionRegistrationType = 'standard' | 'selfRelay' | 'p2pRelay';

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

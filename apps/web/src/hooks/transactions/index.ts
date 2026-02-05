// Transaction hooks barrel export

export { useMerkleTree, type TransactionLeaf, type MerkleTreeData } from './useMerkleTree';

export {
  useTransactionAcknowledgement,
  type TxAcknowledgementParams,
  type TxAcknowledgementParamsHub,
  type TxAcknowledgementParamsSpoke,
  type UseTxAcknowledgementResult,
} from './useTransactionAcknowledgement';

export {
  useTransactionRegistration,
  type TxRegistrationParams,
  type TxRegistrationParamsHub,
  type TxRegistrationParamsSpoke,
  type UseTxRegistrationResult,
} from './useTransactionRegistration';

export {
  useTransactionHashStruct,
  useTransactionAcknowledgementHashStruct,
  useTransactionRegistrationHashStruct,
  type TxHashStructData,
  type TxHashStructRefetchResult,
  type UseTxHashStructResult,
} from './useTransactionHashStruct';

export {
  useUserTransactions,
  type UserTransaction,
  type UseUserTransactionsResult,
} from './useUserTransactions';

export {
  useSignTxEIP712,
  type TxSignAckParams,
  type TxSignRegParams,
  type UseSignTxEIP712Result,
} from './useSignTxEIP712';

// Re-export from merged hook file
export {
  useTxContractNonce,
  type UseContractNonceExtendedResult as UseTxContractNonceResult,
} from '../useContractNonce';

// Re-export from merged hook file
export {
  useTxContractDeadlines,
  type TxDeadlineData,
  type UseTxContractDeadlinesResult,
} from '../useContractDeadlines';

export { useTxQuoteFee, type TxQuoteFeeData, type UseTxQuoteFeeResult } from './useTxQuoteFee';

// Re-export from merged hook file
export { useTxQuoteFeeBreakdown, type UseTxQuoteFeeBreakdownResult } from '../useQuoteFeeBreakdown';

export {
  useTxGasEstimate,
  type TxGasEstimate,
  type UseTxGasEstimateParams,
  type UseTxGasEstimateResult,
} from './useTxGasEstimate';

export {
  useTxCrossChainConfirmation,
  needsTxCrossChainConfirmation,
  type TxCrossChainStatus,
  type UseTxCrossChainConfirmationOptions,
  type UseTxCrossChainConfirmationResult,
} from './useTxCrossChainConfirmation';

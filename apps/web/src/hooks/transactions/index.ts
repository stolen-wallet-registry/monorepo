// Transaction hooks barrel export

export {
  useMerkleTree,
  useMerkleProof,
  buildMerkleTree,
  type TransactionLeaf,
  type MerkleTreeData,
} from './useMerkleTree';

export {
  useTransactionAcknowledgement,
  type TxAcknowledgementParams,
  type UseTxAcknowledgementResult,
} from './useTransactionAcknowledgement';

export {
  useTransactionRegistration,
  type TxRegistrationParams,
  type UseTxRegistrationResult,
} from './useTransactionRegistration';

export {
  useTransactionHashStruct,
  useTransactionAcknowledgementHashStruct,
  useTransactionRegistrationHashStruct,
  type TxHashStructData,
  type UseTxHashStructResult,
} from './useTransactionHashStruct';

export {
  useUserTransactions,
  isSuspiciousTransaction,
  type UserTransaction,
  type UseUserTransactionsResult,
} from './useUserTransactions';

export {
  useSignTxEIP712,
  type TxSignAckParams,
  type TxSignRegParams,
  type UseSignTxEIP712Result,
} from './useSignTxEIP712';

export { useTxContractNonce, type UseTxContractNonceResult } from './useTxContractNonce';

export {
  useTxContractDeadlines,
  type TxDeadlineData,
  type UseTxContractDeadlinesResult,
} from './useTxContractDeadlines';

export { useTxQuoteFee, type TxQuoteFeeData, type UseTxQuoteFeeResult } from './useTxQuoteFee';

export const StolenTransactionRegistryABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_feeManager',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_registryHub',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_graceBlocks',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: '_deadlineBlocks',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'acknowledge',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'transactionCount',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'transactionHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'v',
        type: 'uint8',
        internalType: 'uint8',
      },
      {
        name: 'r',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 's',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'computeBatchId',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'deadlineBlocks',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'eip712Domain',
    inputs: [],
    outputs: [
      {
        name: 'fields',
        type: 'bytes1',
        internalType: 'bytes1',
      },
      {
        name: 'name',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'version',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'chainId',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'verifyingContract',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'salt',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'extensions',
        type: 'uint256[]',
        internalType: 'uint256[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'feeManager',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'generateHashStruct',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'transactionCount',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'forwarder',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'step',
        type: 'uint8',
        internalType: 'uint8',
      },
    ],
    outputs: [
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'hashStruct',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAcknowledgement',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IStolenTransactionRegistry.AcknowledgementData',
        components: [
          {
            name: 'pendingMerkleRoot',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'pendingChainId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'trustedForwarder',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'pendingTxCount',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'startBlock',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'expiryBlock',
            type: 'uint32',
            internalType: 'uint32',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBatch',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IStolenTransactionRegistry.TransactionBatch',
        components: [
          {
            name: 'merkleRoot',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'reporter',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'transactionCount',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'reportedChainId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'sourceChainId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'bridgeId',
            type: 'uint8',
            internalType: 'uint8',
          },
          {
            name: 'isSponsored',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'operatorVerified',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'crossChainMessageId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDeadlines',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'currentBlock',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'expiryBlock',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'startBlock',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'graceStartsAt',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'timeLeft',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'isExpired',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOperatorBatch',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IStolenTransactionRegistry.OperatorTransactionBatch',
        components: [
          {
            name: 'merkleRoot',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'operator',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'transactionCount',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'reportedChainId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'invalidated',
            type: 'bool',
            internalType: 'bool',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'graceBlocks',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'invalidateTransactionBatch',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'invalidateTransactionEntry',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isBatchRegistered',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOperatorBatchRegistered',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isPending',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isTransactionEntryInvalidated',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonces',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'operatorRegistry',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingOwner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'quoteRegistration',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'transactionHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'v',
        type: 'uint8',
        internalType: 'uint8',
      },
      {
        name: 'r',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 's',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'registerBatchAsOperator',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'transactionHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'registerFromHub',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'sourceChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'transactionCount',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'transactionHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'isSponsored',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'bridgeId',
        type: 'uint8',
        internalType: 'uint8',
      },
      {
        name: 'crossChainMessageId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registryHub',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'reinstateTransactionEntry',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setOperatorRegistry',
    inputs: [
      {
        name: '_operatorRegistry',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'verifyOperatorTransaction',
    inputs: [
      {
        name: 'txHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'chainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'merkleProof',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'verifyTransaction',
    inputs: [
      {
        name: 'txHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'chainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'merkleProof',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'EIP712DomainChanged',
    inputs: [],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OperatorRegistrySet',
    inputs: [
      {
        name: 'oldRegistry',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newRegistry',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OperatorVerified',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferStarted',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionBatchAcknowledged',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'reporter',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'forwarder',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'transactionCount',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'isSponsored',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionBatchInvalidated',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionBatchRegistered',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'merkleRoot',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'reporter',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'transactionCount',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'isSponsored',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'transactionHashes',
        type: 'bytes32[]',
        indexed: false,
        internalType: 'bytes32[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        indexed: false,
        internalType: 'bytes32[]',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionBatchRegisteredByOperator',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'merkleRoot',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'transactionCount',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'transactionHashes',
        type: 'bytes32[]',
        indexed: false,
        internalType: 'bytes32[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        indexed: false,
        internalType: 'bytes32[]',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionEntryInvalidated',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionEntryReinstated',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'Acknowledgement__Expired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'Acknowledgement__InvalidSigner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ECDSAInvalidSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ECDSAInvalidSignatureLength',
    inputs: [
      {
        name: 'length',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'ECDSAInvalidSignatureS',
    inputs: [
      {
        name: 's',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
  },
  {
    type: 'error',
    name: 'FeeForwardFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidBridgeId',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidChainId',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidFeeConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidMerkleProof',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidMerkleRoot',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidNonce',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidReporter',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidShortString',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidTimingConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidTransactionCount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'LeavesNotSorted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MerkleRootMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'Registration__ForwarderExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'Registration__GracePeriodNotStarted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'Registration__InvalidForwarder',
    inputs: [],
  },
  {
    type: 'error',
    name: 'Registration__InvalidSigner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'Registration__SignatureExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__AlreadyInvalidated',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__BatchAlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__BatchNotFound',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__EntryNotInvalidated',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__InvalidChainIdEntry',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__InvalidMerkleRoot',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__InvalidTransactionCount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__InvalidTransactionHash',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__MerkleRootMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StolenTransactionRegistry__NotApprovedOperator',
    inputs: [],
  },
  {
    type: 'error',
    name: 'StringTooLong',
    inputs: [
      {
        name: 'str',
        type: 'string',
        internalType: 'string',
      },
    ],
  },
  {
    type: 'error',
    name: 'UnauthorizedCaller',
    inputs: [],
  },
] as const;

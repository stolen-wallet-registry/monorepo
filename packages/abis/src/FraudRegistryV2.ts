export const FraudRegistryV2ABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_operatorRegistry',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_feeManager',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_feeRecipient',
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
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'nonce',
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
    name: 'crossChainInbox',
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
    name: 'feeRecipient',
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
        name: 'reportedChainId',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        internalType: 'uint64',
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
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'data',
        type: 'tuple',
        internalType: 'struct IFraudRegistryV2.AcknowledgementData',
        components: [
          {
            name: 'trustedForwarder',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'startBlock',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'expiryBlock',
            type: 'uint256',
            internalType: 'uint256',
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
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    outputs: [
      {
        name: 'batch',
        type: 'tuple',
        internalType: 'struct IFraudRegistryV2.Batch',
        components: [
          {
            name: 'submitter',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'createdAtTimestamp',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'entryCount',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'isOperator',
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
    name: 'getDeadlines',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'currentBlock',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'expiryBlock',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'startBlock',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'graceStartsAt',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'timeLeft',
        type: 'uint256',
        internalType: 'uint256',
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
    name: 'getEvmWalletDetails',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'registered',
        type: 'bool',
        internalType: 'bool',
      },
      {
        name: 'namespace',
        type: 'uint8',
        internalType: 'enum IFraudRegistryV2.Namespace',
      },
      {
        name: 'reportedChainIdHash',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'registeredAtTimestamp',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'batchId',
        type: 'uint32',
        internalType: 'uint32',
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
    name: 'isContractRegistered',
    inputs: [
      {
        name: 'contractAddr',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'chainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: 'registered',
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
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'pending',
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
        name: 'caip10',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: 'pending',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'registered',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [
      {
        name: 'caip10',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: 'registered',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isTransactionRegistered',
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
    ],
    outputs: [
      {
        name: 'registered',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextBatchId',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
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
    name: 'operatorSubmitter',
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
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'paused',
    inputs: [],
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
    inputs: [],
    outputs: [
      {
        name: 'fee',
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
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'deadline',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: 'nonce',
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
    name: 'registerContractsFromOperator',
    inputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'contractIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [
      {
        name: 'batchId',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerFromSpoke',
    inputs: [
      {
        name: 'namespaceHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'chainRef',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'identifier',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        internalType: 'uint64',
      },
      {
        name: 'sourceChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: '',
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
    name: 'registerTransactionsFromOperator',
    inputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'txHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [
      {
        name: 'batchId',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerTransactionsFromSpoke',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'dataHash',
        type: 'bytes32',
        internalType: 'bytes32',
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
        name: 'isSponsored',
        type: 'bool',
        internalType: 'bool',
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
    name: 'registerWalletsFromOperator',
    inputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'identifiers',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'reportedChainIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'incidentTimestamps',
        type: 'uint64[]',
        internalType: 'uint64[]',
      },
    ],
    outputs: [
      {
        name: 'batchId',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
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
    name: 'setCrossChainInbox',
    inputs: [
      {
        name: '_crossChainInbox',
        type: 'address',
        internalType: 'address',
      },
    ],
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
    name: 'setOperatorSubmitter',
    inputs: [
      {
        name: '_operatorSubmitter',
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
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'BatchCreated',
    inputs: [
      {
        name: 'batchId',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'entryCount',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'isOperator',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ContractOperatorSourceAdded',
    inputs: [
      {
        name: 'contractAddr',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'chainId',
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
        name: 'batchId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ContractRegistered',
    inputs: [
      {
        name: 'contractAddr',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'chainId',
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
        name: 'batchId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CrossChainInboxSet',
    inputs: [
      {
        name: 'crossChainInbox',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CrossChainTransactionBatchRegistered',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'dataHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'sourceChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
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
        name: 'bridgeId',
        type: 'uint8',
        indexed: false,
        internalType: 'uint8',
      },
      {
        name: 'crossChainMessageId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CrossChainWalletRegistered',
    inputs: [
      {
        name: 'namespaceHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'identifier',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'sourceChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'bridgeId',
        type: 'uint8',
        indexed: false,
        internalType: 'uint8',
      },
      {
        name: 'crossChainMessageId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
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
        name: 'operatorRegistry',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OperatorSubmitterSet',
    inputs: [
      {
        name: 'operatorSubmitter',
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
    name: 'Paused',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionOperatorSourceAdded',
    inputs: [
      {
        name: 'txHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'chainId',
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
        name: 'batchId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionRegistered',
    inputs: [
      {
        name: 'txHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'chainId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'isSponsored',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'batchId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Unpaused',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WalletAcknowledged',
    inputs: [
      {
        name: 'wallet',
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
        name: 'isSponsored',
        type: 'bool',
        indexed: true,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WalletOperatorSourceAdded',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'namespace',
        type: 'uint8',
        indexed: false,
        internalType: 'enum IFraudRegistryV2.Namespace',
      },
      {
        name: 'reportedChainIdHash',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'batchId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WalletRegistered',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'namespace',
        type: 'uint8',
        indexed: false,
        internalType: 'enum IFraudRegistryV2.Namespace',
      },
      {
        name: 'reportedChainIdHash',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'incidentTimestamp',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64',
      },
      {
        name: 'isSponsored',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
      {
        name: 'batchId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'CAIP10Evm__InvalidAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CAIP10__InvalidFormat',
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
    name: 'EnforcedPause',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ExpectedPause',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__ExcessRefundFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__FeeForwardFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__GracePeriodNotStarted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidCaip10Format',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidFeeConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidForwarder',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidNonce',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidTimingConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__InvalidWallet',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__RegistrationExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__SignatureExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__UnauthorizedInbox',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__UnauthorizedOperatorSubmitter',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryV2__UnsupportedNamespace',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidShortString',
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
    name: 'StringsInvalidAddressFormat',
    inputs: [],
  },
] as const;

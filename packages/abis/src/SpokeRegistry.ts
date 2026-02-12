export const SpokeRegistryABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_bridgeAdapter',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_feeManager',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_hubChainId',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_hubInbox',
        type: 'bytes32',
        internalType: 'bytes32',
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
      {
        name: '_bridgeId',
        type: 'uint8',
        internalType: 'uint8',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'receive',
    stateMutability: 'payable',
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
        name: 'trustedForwarder',
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
    name: 'acknowledgeTransactionBatch',
    inputs: [
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
        name: 'transactionCount',
        type: 'uint32',
        internalType: 'uint32',
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
        name: 'reporter',
        type: 'address',
        internalType: 'address',
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
    name: 'bridgeAdapter',
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
    name: 'bridgeId',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint8',
        internalType: 'uint8',
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
        name: 'trustedForwarder',
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
    name: 'generateTransactionHashStruct',
    inputs: [
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
        name: 'transactionCount',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'trustedForwarder',
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
        name: '',
        type: 'tuple',
        internalType: 'struct ISpokeRegistry.AcknowledgementData',
        components: [
          {
            name: 'trustedForwarder',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'incidentTimestamp',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'reportedChainId',
            type: 'bytes32',
            internalType: 'bytes32',
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
    name: 'getDeadlines',
    inputs: [
      {
        name: 'session',
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
    name: 'getTransactionAcknowledgement',
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
        internalType: 'struct ISpokeRegistry.TransactionAcknowledgementData',
        components: [
          {
            name: 'trustedForwarder',
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
            name: 'transactionCount',
            type: 'uint32',
            internalType: 'uint32',
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
    name: 'getTransactionDeadlines',
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
    name: 'hubChainId',
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
    name: 'hubInbox',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
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
        name: '',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isPendingTransactionBatch',
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
    name: 'quoteFeeBreakdown',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct ISpokeRegistry.FeeBreakdown',
        components: [
          {
            name: 'bridgeFee',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'registrationFee',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'total',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'bridgeName',
            type: 'string',
            internalType: 'string',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'quoteRegistration',
    inputs: [
      {
        name: 'owner',
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
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'trustedForwarder',
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
    name: 'registerTransactionBatch',
    inputs: [
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
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
        name: 'reporter',
        type: 'address',
        internalType: 'address',
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
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setHubConfig',
    inputs: [
      {
        name: '_hubChainId',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_hubInbox',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sourceChainId',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'view',
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
    name: 'withdrawFees',
    inputs: [
      {
        name: 'to',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'EIP712DomainChanged',
    inputs: [],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'HubConfigUpdated',
    inputs: [
      {
        name: 'hubChainId',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'hubInbox',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
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
    name: 'RegistrationSentToHub',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'messageId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'hubChainId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TransactionBatchAcknowledged',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'trustedForwarder',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'dataHash',
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
    name: 'TransactionBatchSentToHub',
    inputs: [
      {
        name: 'reporter',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'messageId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'dataHash',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'hubChainId',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
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
        name: 'trustedForwarder',
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
    ],
    anonymous: false,
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
    name: 'SpokeRegistry__ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__DataMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__EmptyBatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__ForwarderExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__GracePeriodNotStarted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__HubNotConfigured',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidDataHash',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidForwarder',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidHubConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidNonce',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidOwner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidSigner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidStep',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__InvalidTimingConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__RefundFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__SignatureExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__WithdrawalFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeRegistry__ZeroAddress',
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
] as const;

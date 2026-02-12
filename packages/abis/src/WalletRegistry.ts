export const WalletRegistryABI = [
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
        name: 'registeree',
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
    name: 'batchCount',
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
    name: 'getAcknowledgementData',
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
        internalType: 'struct IWalletRegistry.AcknowledgementData',
        components: [
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
            name: 'gracePeriodStart',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'reportedChainId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
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
            name: 'isSponsored',
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
    name: 'getBatch',
    inputs: [
      {
        name: 'batchId',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IWalletRegistry.Batch',
        components: [
          {
            name: 'operatorId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'timestamp',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'walletCount',
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
    name: 'getDeadlines',
    inputs: [
      {
        name: 'registeree',
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
    name: 'getWalletEntry',
    inputs: [
      {
        name: 'caip10',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IWalletRegistry.WalletEntry',
        components: [
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
            name: 'messageId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'incidentTimestamp',
            type: 'uint64',
            internalType: 'uint64',
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
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getWalletEntry',
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
        internalType: 'struct IWalletRegistry.WalletEntry',
        components: [
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
            name: 'messageId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'incidentTimestamp',
            type: 'uint64',
            internalType: 'uint64',
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
    name: 'hub',
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
    name: 'isWalletPending',
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
    name: 'isWalletRegistered',
    inputs: [
      {
        name: 'caip10',
        type: 'string',
        internalType: 'string',
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
    name: 'isWalletRegistered',
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
        name: '',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [
      {
        name: 'breakdown',
        type: 'tuple',
        internalType: 'struct IWalletRegistry.FeeBreakdown',
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
        name: 'registeree',
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
    name: 'registerFromHub',
    inputs: [
      {
        name: 'namespaceHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'chainRefHash',
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
        name: 'messageId',
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
        name: 'operatorId',
        type: 'bytes32',
        internalType: 'bytes32',
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
        type: 'uint256',
        internalType: 'uint256',
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
    name: 'setHub',
    inputs: [
      {
        name: 'newHub',
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
        name: 'newOperatorSubmitter',
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
    name: 'withdrawCollectedFees',
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
        type: 'uint256',
        indexed: true,
        internalType: 'uint256',
      },
      {
        name: 'operatorId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'walletCount',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CrossChainWalletRegistered',
    inputs: [
      {
        name: 'identifier',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'sourceChainId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'bridgeId',
        type: 'uint8',
        indexed: false,
        internalType: 'uint8',
      },
      {
        name: 'messageId',
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
    name: 'FeesWithdrawn',
    inputs: [
      {
        name: 'recipient',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'HubUpdated',
    inputs: [
      {
        name: 'oldHub',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'newHub',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OperatorSubmitterUpdated',
    inputs: [
      {
        name: 'oldOperatorSubmitter',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'newOperatorSubmitter',
        type: 'address',
        indexed: false,
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
    name: 'WalletAcknowledged',
    inputs: [
      {
        name: 'registeree',
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
    name: 'WalletRegistered',
    inputs: [
      {
        name: 'identifier',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        indexed: true,
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
  {
    type: 'error',
    name: 'WalletRegistry__AlreadyAcknowledged',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__DeadlineExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__DeadlineInPast',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__EmptyBatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__FeeTransferFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__GracePeriodNotStarted',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__InvalidForwarder',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__InvalidNonce',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__InvalidSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__InvalidSigner',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__InvalidStep',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__NotAcknowledged',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__OnlyHub',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__OnlyOperatorSubmitter',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__RefundFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'WalletRegistry__ZeroAddress',
    inputs: [],
  },
] as const;

export const StolenWalletRegistryABI = [
  {
    type: 'constructor',
    inputs: [
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
    name: 'acknowledge',
    inputs: [
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
        name: 'owner',
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
    stateMutability: 'payable',
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
        name: '',
        type: 'tuple',
        internalType: 'struct IStolenWalletRegistry.AcknowledgementData',
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
    name: 'getRegistration',
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
        internalType: 'struct IStolenWalletRegistry.RegistrationData',
        components: [
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'sourceChainId',
            type: 'uint32',
            internalType: 'uint32',
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
        name: 'owner',
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
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'registerFromHub',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'sourceChainId',
        type: 'uint32',
        internalType: 'uint32',
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
    type: 'event',
    name: 'EIP712DomainChanged',
    inputs: [],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WalletAcknowledged',
    inputs: [
      {
        name: 'owner',
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
    name: 'WalletRegistered',
    inputs: [
      {
        name: 'owner',
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
    name: 'InsufficientFee',
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
    name: 'InvalidNonce',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidOwner',
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

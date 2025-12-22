export const HyperlaneAdapterABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_mailbox',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_gasPaymaster',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'DEFAULT_GAS_AMOUNT',
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
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addDomains',
    inputs: [
      {
        name: 'domains',
        type: 'uint32[]',
        internalType: 'uint32[]',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'bridgeName',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: 'string',
      },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'gasAmounts',
    inputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
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
    name: 'gasPaymaster',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IInterchainGasPaymaster',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'mailbox',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IMailbox',
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
    name: 'quoteMessage',
    inputs: [
      {
        name: 'destinationChain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
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
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sendMessage',
    inputs: [
      {
        name: 'destinationChain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'recipient',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'payload',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [
      {
        name: 'messageId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'setDomainSupport',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'supported',
        type: 'bool',
        internalType: 'bool',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setGasAmount',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'gasAmount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'supportedDomains',
    inputs: [
      {
        name: '',
        type: 'uint32',
        internalType: 'uint32',
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
    name: 'supportsChain',
    inputs: [
      {
        name: 'chainId',
        type: 'uint32',
        internalType: 'uint32',
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
    type: 'event',
    name: 'DomainSupportUpdated',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'supported',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'GasAmountUpdated',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'gasAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MessageSent',
    inputs: [
      {
        name: 'messageId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'destinationChain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'recipient',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'payload',
        type: 'bytes',
        indexed: false,
        internalType: 'bytes',
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
    type: 'error',
    name: 'BridgeAdapter__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'BridgeAdapter__PayloadTooLarge',
    inputs: [],
  },
  {
    type: 'error',
    name: 'BridgeAdapter__UnsupportedChain',
    inputs: [],
  },
  {
    type: 'error',
    name: 'HyperlaneAdapter__RefundFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'HyperlaneAdapter__TooManyDomains',
    inputs: [],
  },
  {
    type: 'error',
    name: 'HyperlaneAdapter__ZeroAddress',
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
] as const;

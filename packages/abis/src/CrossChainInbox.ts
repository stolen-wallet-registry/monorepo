export const CrossChainInboxABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_mailbox',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_registryHub',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'BRIDGE_ID',
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
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
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
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'handle',
    inputs: [
      {
        name: '_origin',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_sender',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: '_messageBody',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isTrustedSource',
    inputs: [
      {
        name: 'chainId',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'sender',
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
    name: 'mailbox',
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
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTrustedSource',
    inputs: [
      {
        name: 'chainId',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'spokeRegistry',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'trusted',
        type: 'bool',
        internalType: 'bool',
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
    name: 'RegistrationReceived',
    inputs: [
      {
        name: 'sourceChain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'wallet',
        type: 'address',
        indexed: true,
        internalType: 'address',
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
    name: 'TrustedSourceUpdated',
    inputs: [
      {
        name: 'chainId',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'spokeRegistry',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'trusted',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'CrossChainInbox__InvalidMessage',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainInbox__OnlyBridge',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainInbox__SourceChainMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainInbox__UntrustedSource',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainInbox__ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainMessage__InvalidMessageLength',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainMessage__InvalidMessageType',
    inputs: [],
  },
  {
    type: 'error',
    name: 'CrossChainMessage__UnsupportedVersion',
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

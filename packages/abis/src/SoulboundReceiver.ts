export const SoulboundReceiverABI = [
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
        name: '_walletSoulbound',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_supportSoulbound',
        type: 'address',
        internalType: 'address',
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
    name: 'MSG_TYPE_SUPPORT',
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
    name: 'MSG_TYPE_WALLET',
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
        name: '_message',
        type: 'bytes',
        internalType: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
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
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTrustedForwarder',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: 'forwarder',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'supportSoulbound',
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
    name: 'trustedForwarders',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        internalType: 'uint32',
      },
    ],
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
    name: 'walletSoulbound',
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
    name: 'CrossChainMintExecuted',
    inputs: [
      {
        name: 'mintType',
        type: 'uint8',
        indexed: true,
        internalType: 'enum ISoulboundReceiver.MintType',
      },
      {
        name: 'wallet',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'originDomain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
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
    name: 'TrustedForwarderUpdated',
    inputs: [
      {
        name: 'domain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'forwarder',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
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
    name: 'SoulboundReceiver__InvalidMintType',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SoulboundReceiver__OnlyMailbox',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SoulboundReceiver__SupportMintFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SoulboundReceiver__UntrustedForwarder',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SoulboundReceiver__WalletMintFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SoulboundReceiver__ZeroAddress',
    inputs: [],
  },
] as const;

export const SpokeSoulboundForwarderABI = [
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
        name: '_hubDomain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_hubReceiver',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: '_minDonation',
        type: 'uint256',
        internalType: 'uint256',
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
    name: 'ACTIVATION_DELAY',
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
    name: 'ACTIVATION_EXPIRY',
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
    name: 'activateHubConfig',
    inputs: [
      {
        name: '_hubDomain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_hubReceiver',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'activateOwnershipTransfer',
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
    name: 'activationExpiry',
    inputs: [
      {
        name: 'actionKey',
        type: 'bytes32',
        internalType: 'bytes32',
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
    name: 'bridgeAdapter',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IBridgeAdapter',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'cancelAction',
    inputs: [
      {
        name: 'actionKey',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'completeSetup',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'hubDomain',
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
    name: 'hubReceiver',
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
    name: 'minDonation',
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
    name: 'ownershipTransferKey',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
        internalType: 'address',
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
    name: 'pendingActivations',
    inputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32',
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
    name: 'proposeHubConfig',
    inputs: [
      {
        name: '_hubDomain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_hubReceiver',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'proposeOwnershipTransfer',
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
    name: 'quoteCrossChainFee',
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
    name: 'quoteSupportMintFee',
    inputs: [
      {
        name: 'donationAmount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'total',
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
    name: 'requestSupportMint',
    inputs: [
      {
        name: 'donationAmount',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'requestWalletMint',
    inputs: [
      {
        name: 'wallet',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'setHubConfig',
    inputs: [
      {
        name: '_hubDomain',
        type: 'uint32',
        internalType: 'uint32',
      },
      {
        name: '_hubReceiver',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMinDonation',
    inputs: [
      {
        name: '_minDonation',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setupComplete',
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
    name: 'withdrawDonations',
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
    name: 'ActionActivated',
    inputs: [
      {
        name: 'actionKey',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ActionCancelled',
    inputs: [
      {
        name: 'actionKey',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ActionProposed',
    inputs: [
      {
        name: 'actionKey',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'activationTime',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DonationsWithdrawn',
    inputs: [
      {
        name: 'to',
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
    name: 'HubConfigUpdated',
    inputs: [
      {
        name: 'hubDomain',
        type: 'uint32',
        indexed: true,
        internalType: 'uint32',
      },
      {
        name: 'hubReceiver',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MinDonationUpdated',
    inputs: [
      {
        name: 'oldMinDonation',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'newMinDonation',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MintRequestForwarded',
    inputs: [
      {
        name: 'mintType',
        type: 'uint8',
        indexed: true,
        internalType: 'enum ISpokeSoulboundForwarder.MintType',
      },
      {
        name: 'wallet',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'payer',
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
    name: 'SetupCompleted',
    inputs: [],
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
    name: 'SpokeSoulboundForwarder__DonationBelowMinimum',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeSoulboundForwarder__HubNotConfigured',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeSoulboundForwarder__InsufficientBalance',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeSoulboundForwarder__InsufficientPayment',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeSoulboundForwarder__RefundFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeSoulboundForwarder__WithdrawalFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SpokeSoulboundForwarder__ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__AlreadyPending',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__Expired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__NotProposed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__RenounceDisabled',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__SetupAlreadyComplete',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__SetupNotComplete',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__TooEarly',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__UseTimelockedPath',
    inputs: [],
  },
  {
    type: 'error',
    name: 'TimelockOwnable__ZeroAddress',
    inputs: [],
  },
] as const;

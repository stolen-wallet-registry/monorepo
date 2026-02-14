export const FraudRegistryHubABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_feeRecipient',
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
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'contractRegistry',
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
    name: 'getContractEntry',
    inputs: [
      {
        name: 'contractAddress',
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
        name: '',
        type: 'tuple',
        internalType: 'struct IContractRegistry.ContractEntry',
        components: [
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'batchId',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'threatCategory',
            type: 'uint8',
            internalType: 'uint8',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getRegisteredTypes',
    inputs: [
      {
        name: 'caip10',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: 'registeredIn',
        type: 'uint8[]',
        internalType: 'enum IFraudRegistryHub.RegistryType[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTransactionEntry',
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
        name: '',
        type: 'tuple',
        internalType: 'struct ITransactionRegistry.TransactionEntry',
        components: [
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'batchId',
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
            name: 'batchId',
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
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'inbox',
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
    name: 'isContractRegistered',
    inputs: [
      {
        name: 'contractAddress',
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
    name: 'registerWalletFromSpoke',
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
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setContractRegistry',
    inputs: [
      {
        name: 'newContractRegistry',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFeeRecipient',
    inputs: [
      {
        name: 'newFeeRecipient',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setInbox',
    inputs: [
      {
        name: 'newInbox',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTransactionRegistry',
    inputs: [
      {
        name: 'newTransactionRegistry',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setWalletRegistry',
    inputs: [
      {
        name: 'newWalletRegistry',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transactionRegistry',
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
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'walletRegistry',
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
    name: 'withdrawFees',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'FeeRecipientUpdated',
    inputs: [
      {
        name: 'oldRecipient',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'newRecipient',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
    ],
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
    name: 'InboxUpdated',
    inputs: [
      {
        name: 'oldInbox',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'newInbox',
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
    name: 'RegistryUpdated',
    inputs: [
      {
        name: 'registryType',
        type: 'uint8',
        indexed: true,
        internalType: 'enum IFraudRegistryHub.RegistryType',
      },
      {
        name: 'oldRegistry',
        type: 'address',
        indexed: false,
        internalType: 'address',
      },
      {
        name: 'newRegistry',
        type: 'address',
        indexed: false,
        internalType: 'address',
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
    type: 'error',
    name: 'CAIP10__InvalidFormat',
    inputs: [],
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
    name: 'FraudRegistryHub__InvalidIdentifierLength',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryHub__OnlyInbox',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryHub__UnknownRegistryType',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryHub__WithdrawFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudRegistryHub__ZeroAddress',
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

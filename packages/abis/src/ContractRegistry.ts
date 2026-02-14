export const ContractRegistryABI = [
  {
    type: 'constructor',
    inputs: [
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
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'contractBatchCount',
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
    name: 'getContractBatch',
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
        internalType: 'struct IContractRegistry.ContractBatch',
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
            name: 'contractCount',
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
    name: 'getContractEntry',
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
    name: 'isContractRegistered',
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
    name: 'registerContractsFromOperator',
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
        name: 'threatCategories',
        type: 'uint8[]',
        internalType: 'uint8[]',
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
    type: 'event',
    name: 'ContractBatchCreated',
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
        name: 'contractCount',
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
        name: 'operatorId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'batchId',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
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
    name: 'ContractRegistry__AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ContractRegistry__ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ContractRegistry__EmptyBatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ContractRegistry__OnlyOperatorSubmitter',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ContractRegistry__ZeroAddress',
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
    name: 'StringsInvalidAddressFormat',
    inputs: [],
  },
] as const;

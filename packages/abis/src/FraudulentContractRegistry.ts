export const FraudulentContractRegistryABI = [
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
        name: '_registryHub',
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
    name: 'computeBatchId',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
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
    name: 'computeEntryHash',
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
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    stateMutability: 'pure',
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
    name: 'getBatch',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IFraudulentContractRegistry.ContractBatch',
        components: [
          {
            name: 'merkleRoot',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'operator',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'reportedChainId',
            type: 'bytes32',
            internalType: 'bytes32',
          },
          {
            name: 'registeredAt',
            type: 'uint64',
            internalType: 'uint64',
          },
          {
            name: 'contractCount',
            type: 'uint32',
            internalType: 'uint32',
          },
          {
            name: 'invalidated',
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
    name: 'invalidateBatch',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'invalidateEntry',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isBatchRegistered',
    inputs: [
      {
        name: 'batchId',
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
    name: 'isEntryInvalidated',
    inputs: [
      {
        name: 'entryHash',
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
    name: 'quoteRegistration',
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
    name: 'registerBatch',
    inputs: [
      {
        name: 'merkleRoot',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'reportedChainId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'contractAddresses',
        type: 'address[]',
        internalType: 'address[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
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
    name: 'reinstateEntry',
    inputs: [
      {
        name: 'entryHash',
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
    name: 'verifyContract',
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
      {
        name: 'batchId',
        type: 'bytes32',
        internalType: 'bytes32',
      },
      {
        name: 'merkleProof',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
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
    type: 'event',
    name: 'BatchInvalidated',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'invalidatedBy',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ContractBatchRegistered',
    inputs: [
      {
        name: 'batchId',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'merkleRoot',
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
        name: 'reportedChainId',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32',
      },
      {
        name: 'contractCount',
        type: 'uint32',
        indexed: false,
        internalType: 'uint32',
      },
      {
        name: 'contractAddresses',
        type: 'address[]',
        indexed: false,
        internalType: 'address[]',
      },
      {
        name: 'chainIds',
        type: 'bytes32[]',
        indexed: false,
        internalType: 'bytes32[]',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EntryInvalidated',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'invalidatedBy',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EntryReinstated',
    inputs: [
      {
        name: 'entryHash',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32',
      },
      {
        name: 'reinstatedBy',
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
    type: 'error',
    name: 'FraudulentContractRegistry__AlreadyInvalidated',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__BatchNotFound',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__FeeForwardFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__InvalidChainId',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__InvalidContractCount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__InvalidMerkleRoot',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__MerkleRootMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__NotApprovedOperator',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FraudulentContractRegistry__NotInvalidated',
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

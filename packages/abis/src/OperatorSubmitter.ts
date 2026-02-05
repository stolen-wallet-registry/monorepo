export const OperatorSubmitterABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_owner',
        type: 'address',
        internalType: 'address',
      },
      {
        name: '_fraudRegistry',
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
        name: '_feeRecipient',
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
    name: 'fraudRegistry',
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
    name: 'quoteBatchFee',
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
    name: 'registerContractsAsOperator',
    inputs: [
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'contractIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'registerTransactionsAsOperator',
    inputs: [
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'txHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'registerWalletsAsOperator',
    inputs: [
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
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
    name: 'setFeeManager',
    inputs: [
      {
        name: '_feeManager',
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
        name: '_feeRecipient',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFraudRegistry',
    inputs: [
      {
        name: '_fraudRegistry',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setOperatorRegistry',
    inputs: [
      {
        name: '_operatorRegistry',
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
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'validateContractBatch',
    inputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'contractIds',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [
      {
        name: 'result',
        type: 'tuple',
        internalType: 'struct IOperatorSubmitter.ContractBatchValidation',
        components: [
          {
            name: 'isValid',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'isApprovedOperator',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'requiredFee',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'newEntryCount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'duplicateCount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isDuplicate',
            type: 'bool[]',
            internalType: 'bool[]',
          },
          {
            name: 'errorCode',
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
    name: 'validateTransactionBatch',
    inputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'txHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
    ],
    outputs: [
      {
        name: 'result',
        type: 'tuple',
        internalType: 'struct IOperatorSubmitter.TransactionBatchValidation',
        components: [
          {
            name: 'isValid',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'isApprovedOperator',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'requiredFee',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'newEntryCount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'duplicateCount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isDuplicate',
            type: 'bool[]',
            internalType: 'bool[]',
          },
          {
            name: 'errorCode',
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
    name: 'validateWalletBatch',
    inputs: [
      {
        name: 'operator',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'namespaceHashes',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
      },
      {
        name: 'chainRefs',
        type: 'bytes32[]',
        internalType: 'bytes32[]',
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
        name: 'result',
        type: 'tuple',
        internalType: 'struct IOperatorSubmitter.WalletBatchValidation',
        components: [
          {
            name: 'isValid',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'isApprovedOperator',
            type: 'bool',
            internalType: 'bool',
          },
          {
            name: 'requiredFee',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'newEntryCount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'duplicateCount',
            type: 'uint256',
            internalType: 'uint256',
          },
          {
            name: 'isDuplicate',
            type: 'bool[]',
            internalType: 'bool[]',
          },
          {
            name: 'errorCode',
            type: 'uint8',
            internalType: 'uint8',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'FeeManagerSet',
    inputs: [
      {
        name: 'feeManager',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'FraudRegistrySet',
    inputs: [
      {
        name: 'fraudRegistry',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OperatorRegistrySet',
    inputs: [
      {
        name: 'operatorRegistry',
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
    name: 'OperatorSubmitter__ArrayLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__EmptyBatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__FeeForwardFailed',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__InsufficientFee',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__InvalidFeeConfig',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__NotApprovedOperator',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__RegistryPaused',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OperatorSubmitter__ZeroAddress',
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

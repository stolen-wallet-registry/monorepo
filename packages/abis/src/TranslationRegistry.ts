export const TranslationRegistryABI = [
  {
    type: 'constructor',
    inputs: [],
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
    name: 'addLanguage',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'title',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'subtitle',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'warning',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'footer',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getLanguage',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: 'title',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'subtitle',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'warning',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'footer',
        type: 'string',
        internalType: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSupportedLanguages',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string[]',
        internalType: 'string[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTranslation',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'key',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'string',
        internalType: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isLanguageSupported',
    inputs: [
      {
        name: 'languageCode',
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
    name: 'updateLanguage',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'title',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'subtitle',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'warning',
        type: 'string',
        internalType: 'string',
      },
      {
        name: 'footer',
        type: 'string',
        internalType: 'string',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'LanguageAdded',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        indexed: true,
        internalType: 'string',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'LanguageUpdated',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        indexed: true,
        internalType: 'string',
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
    name: 'EmptyLanguageCode',
    inputs: [],
  },
  {
    type: 'error',
    name: 'LanguageAlreadyExists',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        internalType: 'string',
      },
    ],
  },
  {
    type: 'error',
    name: 'LanguageNotSupported',
    inputs: [
      {
        name: 'languageCode',
        type: 'string',
        internalType: 'string',
      },
    ],
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

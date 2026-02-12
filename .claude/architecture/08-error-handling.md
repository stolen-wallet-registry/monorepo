# Error Handling

Error types, sanitization, and recovery patterns.

---

## Error Flow

```
Error thrown → catch block → sanitizeErrorMessage() → logger.*.error() → setError(msg) → UI displays
```

---

## sanitizeErrorMessage

**File:** `apps/web/src/lib/utils.ts`

Converts technical errors to user-friendly messages:

```typescript
import { sanitizeErrorMessage } from '@/lib/utils';

try {
  await submitTransaction();
} catch (err) {
  const message = sanitizeErrorMessage(err);
  setError(message);
}
```

**Translations:**
| Error Type | User Message |
|------------|--------------|
| `UserRejectedRequestError` | "Transaction was cancelled..." |
| `InsufficientFundsError` | "Insufficient funds..." |
| `NonceTooLowError` | "Transaction conflict detected..." |
| Network errors | "Network error..." |
| Unknown/short | "An unexpected error occurred..." |

---

## Contract Error Decoding

Contract errors are decoded via `@swr/errors` package. Error selectors (4-byte hex) are mapped to human-readable messages.

**Package:** `packages/errors/src/selectors.ts`

```typescript
// Example selectors (100+ total, organized by contract)
'0x5934e5e0': { name: 'WalletRegistry__InvalidNonce', message: '...' },
'0xbf69e113': { name: 'WalletRegistry__InvalidSignature', message: '...' },
'0x3214c145': { name: 'WalletRegistry__GracePeriodNotStarted', message: '...' },
'0x30866145': { name: 'WalletRegistry__InvalidForwarder', message: '...' },
'0x378855ef': { name: 'TransactionRegistry__AlreadyAcknowledged', message: '...' },
'0x97606fef': { name: 'TransactionRegistry__DataHashMismatch', message: '...' },
'0xbefa3abb': { name: 'SpokeRegistry__InvalidStep', message: '...' },
```

Re-exported in `apps/web/src/lib/errors/contractErrors.ts` from `@swr/errors`.

When adding new contract errors:

1. Define error in Solidity: `error MyContract__DescriptiveName();`
2. Compute selector: `cast sig 'MyContract__DescriptiveName()'`
3. Add to `packages/errors/src/selectors.ts`

---

## Custom Error Classes

**RelayConfigurationError** (`@swr/p2p`)

- Thrown when relay servers are not configured for production

**StreamDataValidationError** (`apps/web/src/lib/p2p/libp2p.ts`)

- Thrown when P2P stream data exceeds size limits or fails schema validation

---

## Error Handler Factories

**File:** `apps/web/src/lib/errors/index.ts`

```typescript
// For signature operations
const handleError = createSignatureErrorHandler(setError, setStatus, 'acknowledgement');

// For form operations
const handleError = createFormErrorHandler(setError);
```

---

## Component Pattern

```typescript
const { submitTx, isError, error, reset } = useAcknowledgement();
const [localError, setLocalError] = useState<string | null>(null);

const handleSubmit = async () => {
  setLocalError(null);
  try {
    await submitTx();
  } catch (err) {
    logger.contract.error('Failed', { err }, err as Error);
    setLocalError(sanitizeErrorMessage(err));
  }
};

const handleRetry = () => {
  reset(); // Reset hook state
  setLocalError(null);
};

// Combined error for display
const errorMessage = localError || (error ? sanitizeErrorMessage(error) : null);
```

---

## UI Display

**Blocking errors (Alert):**

```tsx
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertDescription>{errorMessage}</AlertDescription>
</Alert>
```

**Toast notifications:**

```typescript
import { toast } from 'sonner';
toast.error('Failed to copy');
```

---

## Recovery Actions

| Action     | Implementation                |
| ---------- | ----------------------------- |
| Retry      | `reset()` + re-submit         |
| Refetch    | `refetch()` from hook         |
| Re-sign    | Navigate back to signing step |
| Start over | Navigate to beginning         |

---

## Key Files

```text
packages/errors/src/
├── selectors.ts              # 100+ error selector → message mappings
└── index.ts                  # Re-exports
apps/web/src/lib/errors/
├── contractErrors.ts         # Re-export from @swr/errors
└── index.ts                  # Error handler factories
apps/web/src/lib/
└── utils.ts                  # sanitizeErrorMessage()
```

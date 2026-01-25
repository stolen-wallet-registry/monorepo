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

## Custom Error Classes

**RelayConfigurationError** (`@swr/p2p`)

- Thrown when relay servers are not configured for production

**Stream data validation errors** (`@swr/p2p`)

- Raised when stream data exceeds size limits or fails schema validation

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

## Contract Error Decoding

Contract error decoding is provided by `@swr/errors` and re-exported in `apps/web/src/lib/errors/contractErrors.ts`.

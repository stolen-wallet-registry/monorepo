# Logger System

Category-based logging for LLM-assisted debugging.

---

## Usage

```typescript
import { logger } from '@/lib/logger';

logger.wallet.info('Connected', { address, chainId });
logger.contract.debug('Reading deadlines', { registeree });
logger.signature.warn('Signature expired', { deadline });
logger.registration.error('Failed', { step }, error);
logger.p2p.info('Peer connected', { peerId });
logger.store.debug('State updated', { action });
logger.ui.info('Component mounted', { name });
```

---

## Categories

| Category       | Purpose                            |
| -------------- | ---------------------------------- |
| `wallet`       | Wallet connection, chain switching |
| `contract`     | Contract reads/writes, tx receipts |
| `signature`    | EIP-712 signing, storage           |
| `registration` | Flow step transitions              |
| `p2p`          | libp2p node, peer connections      |
| `store`        | Zustand state changes (noisy)      |
| `ui`           | Component lifecycle (noisy)        |

---

## Log Levels

| Level   | Use For                         |
| ------- | ------------------------------- |
| `debug` | Detailed flow tracing           |
| `info`  | Normal operations               |
| `warn`  | Recoverable issues              |
| `error` | Failures (include Error object) |

---

## Environment Defaults

| Environment | Enabled | Level | store/ui | Addresses |
| ----------- | ------- | ----- | -------- | --------- |
| development | true    | debug | on       | full      |
| staging     | true    | info  | off      | redacted  |
| production  | false   | warn  | off      | redacted  |
| test        | false   | error | off      | full      |

---

## Configuration

```typescript
import { configureLogger, resetLoggerConfig } from '@/lib/logger';

// Enable specific categories
configureLogger({
  categories: { wallet: true, p2p: true, store: false },
});

// Change level
configureLogger({ level: 'warn' });

// Reset to environment defaults
resetLoggerConfig();
```

---

## Key Files

- `apps/web/src/lib/logger/index.ts` - Main exports
- `apps/web/src/lib/logger/core.ts` - Logger implementation
- `apps/web/src/lib/logger/config.ts` - Environment config
- `apps/web/src/lib/logger/formatters.ts` - Safe stringify, address redaction

---

## Features

- **Safe stringify**: Handles circular refs, BigInt, Error objects
- **Sensitive data redaction**: privateKey, password, mnemonic, etc.
- **Address redaction**: `0x742d...bEb0` format in staging/production
- **Clean output**: No stack traces (for LLM copy-paste)

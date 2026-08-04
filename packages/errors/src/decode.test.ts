import { describe, it, expect, vi } from 'vitest';
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
  encodeErrorResult,
  parseAbi,
} from 'viem';
import {
  decodeContractError,
  decodeContractErrorFromError,
  getContractErrorInfo,
  sanitizeErrorMessage,
} from './decode';
import { CONTRACT_ERROR_SELECTORS } from './selectors';

/**
 * Build the error object viem actually throws for a reverted contract call.
 *
 * The nesting matters: viem wraps `ContractFunctionRevertedError` inside a
 * `ContractFunctionExecutionError`, so the decoder has to walk the cause chain rather
 * than inspect the top-level error. Hand-writing a message string (as the original tests
 * did) exercises a code path that no real viem call can reach.
 */
function makeViemRevertError({
  abi,
  data,
  functionName = 'register',
}: {
  abi: readonly unknown[];
  data: `0x${string}`;
  functionName?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedAbi = abi as any;
  const reverted = new ContractFunctionRevertedError({ abi: typedAbi, data, functionName });
  return new ContractFunctionExecutionError(reverted, { abi: typedAbi, functionName });
}

const REVERT_ABI = parseAbi([
  'error SpokeRegistry__ForwarderExpired()',
  'function register() returns (bool)',
]);

describe('decodeContractError', () => {
  it('decodes known error selector to user-friendly message', () => {
    const result = decodeContractError('Execution reverted: custom error 0x9525dee7');
    expect(result).toContain('registration window has expired');
  });

  it('returns null for unknown selector', () => {
    expect(decodeContractError('custom error 0x12345678')).toBeNull();
  });

  it('handles case insensitive selector', () => {
    const lower = decodeContractError('custom error 0x9525dee7');
    const upper = decodeContractError('custom error 0x9525DEE7');
    expect(lower).toBe(upper);
  });
});

describe('getContractErrorInfo', () => {
  it('returns error info for known selector', () => {
    const info = getContractErrorInfo('0x9525dee7');
    expect(info?.name).toBe('SpokeRegistry__ForwarderExpired');
  });

  it('returns undefined for unknown selector', () => {
    expect(getContractErrorInfo('0x12345678')).toBeUndefined();
  });
});

describe('decodeContractErrorFromError', () => {
  it('decodes a real viem revert by ABI-decoded error name', () => {
    const data = encodeErrorResult({
      abi: REVERT_ABI,
      errorName: 'SpokeRegistry__ForwarderExpired',
    });
    const error = makeViemRevertError({ abi: REVERT_ABI, data });

    expect(decodeContractErrorFromError(error)).toContain('registration window has expired');
  });

  // When the reverted error is absent from the ABI passed to the call, viem cannot decode a
  // name and surfaces only the raw selector — the selector map has to cover that case.
  it('falls back to the selector when the error is not in the ABI', () => {
    const abiWithoutError = parseAbi(['function register() returns (bool)']);
    const error = makeViemRevertError({ abi: abiWithoutError, data: '0x9525dee7' });

    expect(decodeContractErrorFromError(error)).toContain('registration window has expired');
  });

  it('returns null for an unrecognized revert', () => {
    const abiWithoutError = parseAbi(['function register() returns (bool)']);
    const error = makeViemRevertError({ abi: abiWithoutError, data: '0x12345678' });

    expect(decodeContractErrorFromError(error)).toBeNull();
  });

  it('returns null for non-viem errors', () => {
    expect(decodeContractErrorFromError(new Error('boom'))).toBeNull();
    expect(decodeContractErrorFromError('boom')).toBeNull();
    expect(decodeContractErrorFromError(null)).toBeNull();
  });
});

describe('sanitizeErrorMessage', () => {
  // The end-to-end guarantee: a real viem revert reaches the user as the curated message,
  // not as a raw Solidity error name. This is what the regex-only decoder failed to do.
  it('renders a curated message for a real viem revert', () => {
    const data = encodeErrorResult({
      abi: REVERT_ABI,
      errorName: 'SpokeRegistry__ForwarderExpired',
    });
    const result = sanitizeErrorMessage(makeViemRevertError({ abi: REVERT_ABI, data }));

    expect(result).toContain('registration window has expired');
    expect(result).not.toContain('SpokeRegistry__ForwarderExpired');
  });

  it('decodes contract custom errors', () => {
    const result = sanitizeErrorMessage(new Error('custom error 0x9525dee7'));
    expect(result).toContain('registration window has expired');
  });

  it('handles user rejection', () => {
    expect(sanitizeErrorMessage(new Error('User rejected the request'))).toContain('cancelled');
  });

  it('strips version info and technical details', () => {
    const result = sanitizeErrorMessage(new Error('Error Version: viem@2.41.2'));
    expect(result).not.toContain('Version:');
    expect(result).not.toContain('viem');
  });

  it('returns generic message for empty/short errors', () => {
    expect(sanitizeErrorMessage(new Error(''))).toContain('unexpected error');
    expect(sanitizeErrorMessage(null)).toContain('unexpected error');
  });

  it('calls logError callback when provided', () => {
    const logError = vi.fn();
    sanitizeErrorMessage(new Error('test'), logError);
    expect(logError).toHaveBeenCalled();
  });

  it('handles non-Error objects', () => {
    expect(sanitizeErrorMessage({ message: 'some error' })).toBeDefined();
    expect(sanitizeErrorMessage('plain string error')).toBeDefined();
  });

  it('handles errors with Raw Call Arguments section', () => {
    const result = sanitizeErrorMessage(new Error('Error occurred Raw Call Arguments: 0x1234...'));
    expect(result).not.toContain('Raw Call Arguments');
  });

  it('handles multiple error patterns in one message', () => {
    const result = sanitizeErrorMessage(
      new Error('custom error 0x9525dee7 Version: viem@2.41.2 Details: something')
    );
    expect(result).toContain('registration window has expired');
    expect(result).not.toContain('Version:');
  });

  // V29 residual. The old rule was `/\s*Details:\s*[^.]+\./gi` — it stopped at the FIRST
  // period, so a details clause containing a dotted host stripped only as far as that host's
  // first dot and rendered everything after it. Against the old rule this test fails with the
  // key still present, which is the whole point of it existing.
  it('strips a Details clause whose contents contain periods, including a keyed URL', () => {
    const result = sanitizeErrorMessage(
      new Error(
        'HTTP request failed. Details: request to https://eth-mainnet.g.alchemy.com/v2/SECRETKEY123 failed. retrying.'
      )
    );

    expect(result).not.toContain('SECRETKEY123');
    expect(result).not.toContain('alchemy.com');
    expect(result).not.toContain('Details:');
  });

  // The other half of the same defect: no trailing period meant the old rule matched nothing
  // and the entire clause survived verbatim.
  it('strips a Details clause with no trailing period', () => {
    const result = sanitizeErrorMessage(
      new Error('Request failed. Details: connection refused to https://rpc.example.com/v2/KEYABC')
    );

    expect(result).not.toContain('KEYABC');
    expect(result).not.toContain('Details:');
  });

  // Truncating Details to end-of-LINE rather than end-of-string is deliberate: viem puts
  // Version and Raw Call Arguments on their own lines, and swallowing them here would make
  // their own redaction rules untestable. This pins that boundary.
  it('does not swallow following lines when stripping Details', () => {
    const result = sanitizeErrorMessage(
      new Error(
        'Execution reverted.\nDetails: execution reverted: some reason\nVersion: viem@2.41.2'
      )
    );

    expect(result).not.toContain('Details:');
    expect(result).not.toContain('Version:');
    expect(result).toContain('Execution reverted');
  });
});

/**
 * The keyed transport is LIVE — this is not a latent risk.
 *
 * `apps/web/src/lib/ens-config.ts` builds
 * `https://eth-mainnet.g.alchemy.com/v2/${VITE_ALCHEMY_API_KEY}` (or takes
 * `VITE_MAINNET_RPC_URL` verbatim) and hands it to the viem client behind `useEnsDisplay`
 * and `useEnsResolve`, so any ENS failure already produces a viem error carrying the key in
 * its `URL:` line. The sanitized string is rendered at ~20 UI sites, so anything it carries
 * goes straight into the DOM.
 *
 * These tests are therefore load-bearing, not defensive. Do NOT relax them on the old
 * assumption that no key is in play.
 */
describe('sanitizeErrorMessage — never leaks request details (V29)', () => {
  const SECRET_KEY = 'sEcReTaLcHeMyKeY123456789';
  const KEYED_URL = `https://base-mainnet.g.alchemy.com/v2/${SECRET_KEY}`;

  /** viem nests network failures inside a wrapper, so the top-level name is the wrapper's. */
  function makeNestedHttpError(cause: BaseError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedAbi = REVERT_ABI as any;
    return new ContractFunctionExecutionError(cause, {
      abi: typedAbi,
      functionName: 'register',
    });
  }

  it('strips the RPC URL and request body from a nested HttpRequestError', () => {
    const httpError = new HttpRequestError({
      body: { method: 'eth_call', params: [{ data: '0xdeadbeef' }] },
      details: 'connect ECONNREFUSED',
      status: 500,
      url: KEYED_URL,
    });

    const result = sanitizeErrorMessage(makeNestedHttpError(httpError));

    expect(result).not.toContain(SECRET_KEY);
    expect(result).not.toContain('alchemy.com');
    expect(result).not.toContain('URL:');
    expect(result).not.toContain('Request body:');
    expect(result).toContain('Network error');
  });

  it('strips the RPC URL from a nested TimeoutError', () => {
    const timeout = new TimeoutError({
      body: { method: 'eth_call' },
      url: KEYED_URL,
    });

    const result = sanitizeErrorMessage(makeNestedHttpError(timeout));

    expect(result).not.toContain(SECRET_KEY);
    expect(result).toContain('Network error');
  });

  it('strips URL and request body even when no viem error class matches', () => {
    // Defense in depth: an error shape we do not recognize must still not carry the key
    // through the generic tail sanitizer.
    const raw = new Error(
      [
        'Something unexpected went wrong while talking to the node.',
        `URL: ${KEYED_URL}`,
        'Request body: {"method":"eth_call","params":[{"data":"0xabc"}]}',
      ].join('\n')
    );

    const result = sanitizeErrorMessage(raw);

    expect(result).not.toContain(SECRET_KEY);
    expect(result).not.toContain('alchemy.com');
    expect(result).not.toContain('Request body:');
  });

  it('a recognized contract revert still wins over the network path', () => {
    // The revert decoder runs first; walking the chain for network errors must not
    // shadow the more specific message.
    const result = sanitizeErrorMessage(
      makeViemRevertError({
        abi: REVERT_ABI,
        data: encodeErrorResult({
          abi: REVERT_ABI,
          errorName: 'SpokeRegistry__ForwarderExpired',
        }),
      })
    );

    expect(result).not.toContain('Network error');
  });
});

describe('CONTRACT_ERROR_SELECTORS integrity', () => {
  // Selector↔name correctness and ABI coverage are asserted in coverage.test.ts, which
  // derives both from the generated ABIs. A hand-maintained mirror of the map (which is what
  // lived here) is double bookkeeping: it only ever restates what the map already says, and
  // it has to be edited in lockstep with every addition — so it catches typos in itself
  // rather than real drift against Solidity.

  it('error names are unique (by-name map cannot silently drop entries)', () => {
    // CONTRACT_ERROR_BY_NAME is built with Object.fromEntries, which silently keeps the LAST
    // entry on a name collision — a duplicated name would render the wrong curated message
    // with no test failure.
    const names = Object.values(CONTRACT_ERROR_SELECTORS).map((info) => info.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('selectors are well-formed 4-byte hex', () => {
    for (const selector of Object.keys(CONTRACT_ERROR_SELECTORS)) {
      expect(selector, `Malformed selector: ${selector}`).toMatch(/^0x[0-9a-f]{8}$/);
    }
  });

  it('every entry has a non-empty user-facing message', () => {
    for (const [selector, info] of Object.entries(CONTRACT_ERROR_SELECTORS)) {
      expect(info.message.length, `Empty message for ${selector} (${info.name})`).toBeGreaterThan(
        0
      );
    }
  });
});

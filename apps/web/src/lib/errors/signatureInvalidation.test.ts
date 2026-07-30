import { describe, it, expect } from 'vitest';
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
} from 'viem';
import { getContractErrorName, isSignatureInvalidatingError } from './signatureInvalidation';

function makeRevert({
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

const ABI = parseAbi([
  'error WalletRegistry__InvalidNonce()',
  'error WalletRegistry__DeadlineExpired()',
  'error SpokeRegistry__ForwarderExpired()',
  'error WalletRegistry__AlreadyAcknowledged()',
  'error FeeManager__InvalidPrice()',
  'error TimingConfig__WindowBlockTooOld()',
  'error TimingConfig__WindowBlockNotMined()',
  'error TimingConfig__WindowBlockBeforeGracePeriod()',
  'function register() returns (bool)',
]);

function revertWith(errorName: string) {
  return makeRevert({
    abi: ABI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: encodeErrorResult({ abi: ABI as any, errorName } as any),
  });
}

describe('getContractErrorName', () => {
  it('extracts the Solidity error name from a viem revert', () => {
    expect(getContractErrorName(revertWith('WalletRegistry__InvalidNonce'))).toBe(
      'WalletRegistry__InvalidNonce'
    );
  });

  it('falls back to the selector map when the error is not in the call ABI', () => {
    const abiWithoutError = parseAbi(['function register() returns (bool)']);
    // 0x9525dee7 = SpokeRegistry__ForwarderExpired
    const error = makeRevert({ abi: abiWithoutError, data: '0x9525dee7' });

    expect(getContractErrorName(error)).toBe('SpokeRegistry__ForwarderExpired');
  });

  it('returns null for non-contract errors', () => {
    expect(getContractErrorName(new Error('network hiccup'))).toBeNull();
    expect(getContractErrorName('boom')).toBeNull();
  });
});

describe('isSignatureInvalidatingError', () => {
  // These are the reverts where plain "Retry" resubmits a byte-identical transaction that
  // reverts identically forever. The stored signature must be cleared and the user sent back
  // to sign.
  it.each([
    'WalletRegistry__InvalidNonce',
    'WalletRegistry__DeadlineExpired',
    'SpokeRegistry__ForwarderExpired',
    // The registration signature commits to blockhash(windowBlock); once that block ages out
    // of the EVM's 256-block window no resubmission of the same bytes can ever succeed.
    'TimingConfig__WindowBlockTooOld',
    'TimingConfig__WindowBlockNotMined',
    'TimingConfig__WindowBlockBeforeGracePeriod',
  ])('treats %s as signature-invalidating', (name) => {
    expect(isSignatureInvalidatingError(revertWith(name))).toBe(true);
  });

  // Positive path for the OTHER branch: an error that a plain retry can genuinely fix must
  // NOT wipe a perfectly good signature and force a needless re-sign.
  it('leaves a transient / unrelated failure retryable', () => {
    expect(isSignatureInvalidatingError(new Error('replacement fee too low'))).toBe(false);
    expect(isSignatureInvalidatingError(revertWith('FeeManager__InvalidPrice'))).toBe(false);
  });

  // Re-signing does not help when the phase already completed — that is a flow problem, not
  // a stale signature.
  it('does not treat AlreadyAcknowledged as signature-invalidating', () => {
    expect(isSignatureInvalidatingError(revertWith('WalletRegistry__AlreadyAcknowledged'))).toBe(
      false
    );
  });

  it('returns false for null and undefined', () => {
    expect(isSignatureInvalidatingError(null)).toBe(false);
    expect(isSignatureInvalidatingError(undefined)).toBe(false);
  });
});

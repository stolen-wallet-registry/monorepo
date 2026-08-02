import { describe, it, expect } from 'vitest';
import { toFunctionSelector } from 'viem';
import * as abis from '@swr/abis';
import { CONTRACT_ERROR_SELECTORS } from './selectors';

/**
 * Drift guard for the curated contract-error catalogue.
 *
 * The error map is hand-maintained while the ABIs are generated from Forge artifacts, so the
 * two drift silently: an error added or renamed in Solidity simply stops having a curated
 * message and users fall back to raw viem text (`...reverted. Error: SomeContract__Thing()`).
 * That is how 49 user-reachable errors ended up unmapped without anything failing.
 *
 * These tests make the drift a build failure instead. `UNCURATED` is the explicit escape
 * hatch — adding a name to it is a deliberate, reviewable decision that this error is not
 * worth a user-facing message, rather than an oversight.
 */

/** Every `type: 'error'` entry across the generated ABIs, name → canonical signature. */
function collectAbiErrors(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [exportName, abi] of Object.entries(abis)) {
    if (!exportName.endsWith('ABI') || !Array.isArray(abi)) continue;
    for (const item of abi as readonly {
      type: string;
      name?: string;
      inputs?: { type: string }[];
    }[]) {
      if (item.type !== 'error' || !item.name) continue;
      found.set(item.name, `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(',')})`);
    }
  }
  return found;
}

/**
 * Errors deliberately left without a curated message.
 *
 * Two categories, both unreachable from a user flow in a way a message would help:
 *  - Library/encoding internals that only fire on a programming error (Base64, Strings,
 *    SafeCast, ShortString, CAIP10Evm parsing).
 *  - OpenZeppelin token/access plumbing for paths this app never exercises (ERC20/ERC1155 —
 *    the soulbounds are ERC721; approval/operator errors for a non-transferable token).
 * The genuinely reachable OZ errors (Ownable, Pausable, ECDSA, ERC721NonexistentToken,
 * ReentrancyGuard) ARE curated.
 */
const UNCURATED = new Set<string>([
  // Encoding / library internals — only fire on a programming error, never on user input
  'CAIP10Evm__InvalidHexChar',
  'InvalidShortString',
  'StringsInsufficientHexLength',
  'StringsInvalidAddressFormat',
  // ERC-721 transfer/approval plumbing. The soulbounds are non-transferable (ERC-5192), so
  // these paths are unreachable by design — a transfer attempt reverts in the lock check
  // before OZ's own guards are consulted.
  'ERC721IncorrectOwner',
  'ERC721InsufficientApproval',
  'ERC721InvalidApprover',
  'ERC721InvalidOperator',
  'ERC721InvalidOwner',
  'ERC721InvalidReceiver',
  'ERC721InvalidSender',
  // Deployment/owner-only plumbing — a user cannot reach these from any app flow
  'OwnableInvalidOwner',
  'ExpectedPause',
  'ZeroAddress',
  'CrossChainInbox__SweepFailed',
  'HyperlaneAdapter__GasConfigExceedsLimit',
  'SoulboundReceiver__SweepFailed',
  'SoulboundReceiver__ZeroAddress',
  'SoulboundReceiver__OnlyMailbox',
  'SoulboundReceiver__InvalidMintType',
  'SpokeSoulboundForwarder__ZeroAddress',
  'SpokeSoulboundForwarder__InsufficientBalance',
  'SpokeSoulboundForwarder__WithdrawalFailed',
  // Governance and fee-configuration guards added by the V10/V11/V15 audit remediation. Every
  // one of these reverts inside an owner-only setter or the timelocked propose/activate path
  // (FeeManager.sol:353,542,549,560,563 and TimelockOwnable's activation checks), so they are
  // reachable only by the owner/DAO through the CLI or a deploy script — never by a registrant
  // in an app flow. Curated copy here would be dead text.
  'Fee__InvalidBounds',
  'Fee__InvalidThreshold',
  'Fee__PriceOutOfBounds',
  'TimelockOwnable__Expired',
  'TimelockOwnable__SetupNotComplete',
]);

describe('contract error catalogue coverage', () => {
  const abiErrors = collectAbiErrors();

  it('finds errors in the generated ABIs (guards against a vacuous suite)', () => {
    // If the ABI walk silently returned nothing, every assertion below would pass trivially.
    expect(abiErrors.size).toBeGreaterThan(50);
  });

  it('every ABI error is either curated or explicitly excluded', () => {
    const curated = new Set(Object.values(CONTRACT_ERROR_SELECTORS).map((i) => i.name));
    const uncovered = [...abiErrors.keys()].filter((n) => !curated.has(n) && !UNCURATED.has(n));

    expect(
      uncovered,
      `These contract errors have no user-facing message. Add one to CONTRACT_ERROR_SELECTORS, ` +
        `or add the name to UNCURATED with a reason:\n  ${uncovered.join('\n  ')}`
    ).toEqual([]);
  });

  it('every curated selector matches the real signature from the ABI', () => {
    const mismatched: string[] = [];
    for (const [selector, info] of Object.entries(CONTRACT_ERROR_SELECTORS)) {
      const signature = abiErrors.get(info.name);
      if (!signature) continue; // covered by the dead-entry test below
      const expected = toFunctionSelector(signature);
      if (expected !== selector)
        mismatched.push(`${info.name}: mapped ${selector}, actual ${expected}`);
    }
    expect(mismatched).toEqual([]);
  });

  it('has no curated entries for errors that no longer exist', () => {
    const dead = Object.values(CONTRACT_ERROR_SELECTORS)
      .map((i) => i.name)
      .filter((n) => !abiErrors.has(n));

    expect(
      dead,
      `These curated errors are not in any ABI — they were renamed or removed in Solidity:\n  ${dead.join('\n  ')}`
    ).toEqual([]);
  });

  it('UNCURATED contains no stale names', () => {
    const stale = [...UNCURATED].filter((n) => !abiErrors.has(n));
    expect(
      stale,
      `Remove these from UNCURATED — they are no longer in any ABI:\n  ${stale.join('\n  ')}`
    ).toEqual([]);
  });
});

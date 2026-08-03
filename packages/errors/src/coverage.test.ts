import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * The Forge artifact directory, when the contracts have been built in this checkout.
 *
 * `@swr/abis` is a COMMITTED, separately-generated copy of these artifacts, so a guard that
 * reads only `@swr/abis` cannot see the reverse drift: Solidity gains an error → nobody runs
 * `forge build && pnpm export-abi` → the error is in neither the committed ABI nor the map →
 * every assertion below passes, and the new error reaches users as raw viem text. That is
 * precisely the "49 user-reachable errors went unmapped with nothing failing" scenario this
 * file's docblock claims to prevent.
 *
 * The artifacts are gitignored, so they are absent in a node-only environment (including the
 * `Node (lint / typecheck / test)` CI job, which installs no Foundry). The comparison below
 * therefore runs whenever they exist — every developer machine after a `forge build`, and any
 * job with the toolchain — and reports the gap loudly when they do not. See
 * SWR_REQUIRE_FORGE_ARTIFACTS.
 */
const CONTRACTS_OUT = join(dirname(fileURLToPath(import.meta.url)), '../../contracts/out');

/**
 * Contracts whose ABIs are exported to `@swr/abis`.
 *
 * Mirrors the list in `packages/contracts/scripts/export-abi.js`. Kept explicit rather than
 * globbed: `out/` also holds test contracts, mocks and library artifacts whose errors are
 * genuinely not part of the shipped surface, and globbing them in would make this guard demand
 * curated messages for `MockMailbox`.
 */
const EXPORTED_CONTRACTS = [
  'FraudRegistryHub',
  'WalletRegistry',
  'TransactionRegistry',
  'ContractRegistry',
  'OperatorSubmitter',
  'SpokeRegistry',
  'CrossChainInbox',
  'FeeManager',
  'OperatorRegistry',
  'HyperlaneAdapter',
  'TranslationRegistry',
  'WalletSoulbound',
  'SupportSoulbound',
  'SpokeSoulboundForwarder',
  'SoulboundReceiver',
] as const;

/** Error names in the freshly-built Forge artifacts, or null when they are not present. */
function collectForgeErrors(): Map<string, string> | null {
  if (!existsSync(CONTRACTS_OUT)) return null;

  const found = new Map<string, string>();
  let readAny = false;

  for (const name of EXPORTED_CONTRACTS) {
    const artifactPath = join(CONTRACTS_OUT, `${name}.sol`, `${name}.json`);
    if (!existsSync(artifactPath)) continue;
    readAny = true;

    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as {
      abi?: { type: string; name?: string; inputs?: { type: string }[] }[];
    };
    for (const item of artifact.abi ?? []) {
      if (item.type !== 'error' || !item.name) continue;
      found.set(item.name, `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(',')})`);
    }
  }

  return readAny ? found : null;
}

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
  'HyperlaneAdapter__GasConfigBelowFloor',
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

/**
 * The committed ABIs are what every test above reads, so they cannot detect their own
 * staleness. This block compares them against the Forge artifacts — the actual output of the
 * Solidity in this checkout — which is the only comparison that can see an error that exists
 * in `.sol` and in neither the ABI nor the map.
 */
describe('committed ABIs match the compiled contracts', () => {
  const forgeErrors = collectForgeErrors();
  const abiErrors = collectAbiErrors();

  // Not `it.skipIf`: an absent toolchain must be visible in the run, not silently green. Set
  // SWR_REQUIRE_FORGE_ARTIFACTS=1 in any job that should treat their absence as a failure.
  it('has Forge artifacts to compare against', () => {
    if (forgeErrors === null && process.env.SWR_REQUIRE_FORGE_ARTIFACTS !== '1') {
      console.warn(
        `[@swr/errors] ${CONTRACTS_OUT} not found — the ABI-staleness comparison did NOT run. ` +
          `Run 'cd packages/contracts && forge build' to enable it. The abi-drift CI job is ` +
          `the other place this is caught.`
      );
      return;
    }
    expect(
      forgeErrors,
      `No Forge artifacts under ${CONTRACTS_OUT}. Run 'cd packages/contracts && forge build'.`
    ).not.toBeNull();
  });

  it('exports every error the compiled contracts declare', () => {
    if (forgeErrors === null) return;

    const missing = [...forgeErrors.keys()].filter((name) => !abiErrors.has(name));

    expect(
      missing,
      `These errors exist in the compiled contracts but not in packages/abis — the committed ` +
        `ABIs are STALE, and because the curated map is checked against them, the coverage ` +
        `tests above cannot see it. Run:\n` +
        `  cd packages/contracts && forge build && pnpm export-abi\n` +
        `  pnpm exec prettier --write "packages/abis/src/*.ts"\n` +
        `Missing:\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('has no exported errors the compiled contracts no longer declare', () => {
    if (forgeErrors === null) return;

    // Only errors on the exported contracts are comparable; @swr/abis also carries OZ and
    // library errors inherited into those ABIs, which Forge reports on the same artifacts, so
    // the two sets are directly comparable in both directions.
    const removed = [...abiErrors.keys()].filter((name) => !forgeErrors.has(name));

    expect(
      removed,
      `These errors are in the committed ABIs but not in the compiled contracts — the ABIs ` +
        `are stale in the other direction (an error was renamed or removed in Solidity). ` +
        `Regenerate them.\nStale:\n  ${removed.join('\n  ')}`
    ).toEqual([]);
  });

  // Guards against the comparison quietly becoming vacuous — e.g. every artifact path going
  // wrong at once, which would make both assertions above pass on two empty sets.
  it('read a meaningful number of errors from the artifacts', () => {
    if (forgeErrors === null) return;
    expect(forgeErrors.size).toBeGreaterThan(50);
  });

  // The export script's contract list is duplicated here; a contract added there and not here
  // would be exported but never compared.
  it('covers every contract the export script emits', () => {
    if (!existsSync(CONTRACTS_OUT)) return;

    const exportScript = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../contracts/scripts/export-abi.js'),
      'utf-8'
    );
    const listed = [...exportScript.matchAll(/'([A-Za-z0-9]+)\.sol\/\1\.json'/g)].map((m) => m[1]);

    expect(listed.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...EXPORTED_CONTRACTS].sort());
  });
});

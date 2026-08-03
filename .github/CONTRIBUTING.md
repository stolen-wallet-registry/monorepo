# Contributing

## Use Node 22

`.nvmrc` pins **Node 22** and `pnpm install` refuses to run on anything else.

This is not a style preference. Node 24+ ships an experimental Web Storage implementation that
shadows jsdom's, and `apps/web/src/test/setup.ts` deliberately fails loudly rather than run the
suite against the wrong globals — so on Node 24/25 **all 49 web test files fail** with what
looks like a catastrophically broken repo. On Node 22 the same suite is 729/729 green.

```bash
nvm use          # reads .nvmrc
```

The guard is a `preinstall` script in the root `package.json`. `SWR_SKIP_NODE_CHECK=1` bypasses
it if you know what you are doing. CI pins the same version via `node-version-file: .nvmrc`.

## CI only runs when you ask for it

**This is the single most important thing to know about this repo.**

Nothing in `.github/workflows/` runs on its own. There is no `push` trigger, no `schedule`, and
the `pull_request` trigger listens for `labeled` only — so opening a PR runs nothing, and
pushing to a PR runs nothing even if it already carries the label. A PR with no checks on it is
the normal state. Do not mistake "no checks" for "checks passed".

That is a deliberate cost decision: Actions minutes are real money on a pre-release project, and
everything below runs locally for free.

### Two ways to run it, both manual

1. **Add the `ci` label to a PR.** Runs every job. Remove and re-add the label to re-run.
2. **Actions → CI → Run workflow.** Pick a branch, then tick only the jobs you want:

| Input           | Job                                                                    |
| --------------- | ---------------------------------------------------------------------- |
| `contracts`     | `forge test` + gas report                                              |
| `node`          | lint, typecheck, test, prettier, syncpack, knip                        |
| `abi_drift`     | Regenerates ABIs with Foundry and fails on any diff (authoritative)    |
| `supply_chain`  | Lockfile integrity + audit                                             |
| `abi_freshness` | Git-only check that Solidity and ABI changes landed together (seconds) |

The checkboxes default to on, so a plain "Run workflow" is the full sweep. The `ci` label always
runs everything — GitHub has no way to pass inputs from a label.

`abi_freshness` compares against the PR base, or against the default branch on a dispatch — so
dispatching it while on the default branch compares main to itself and trivially passes.

### Labels

| Label              | Effect                                                       |
| ------------------ | ------------------------------------------------------------ |
| `ci`               | Runs every job in `ci.yml`.                                  |
| `hyperlane-forked` | Runs the live-Mailbox check (separate workflow — see below). |

Adding any other label starts a workflow run whose jobs all skip, which costs no runner minutes.

### Do not make any of these a required status check

A required check that never runs blocks every merge forever.

## The other workflow: `hyperlane-forked.yml`

`.github/workflows/hyperlane-forked.yml` is separate from `ci.yml` and runs one thing:
`packages/contracts/test/HyperlaneForked.t.sol` against the real Hyperlane v3 Mailbox on
Optimism Sepolia.

It exists because every other Hyperlane test runs against `test/mocks/MockMailbox.sol`, and a
mock only proves the adapter agrees with our own copy of the interface. The v2→v3 mismatch that
test was written for shipped exactly that way — the mock had the same wrong shape as the
adapter, so nothing failed. `@hyperlane-xyz/core/` remaps to the vendored
`src/vendor/hyperlane/`, so this is the only check that those in-repo copies still match the
deployed contract.

Like everything else here it is manual: add the **`hyperlane-forked`** label to a PR, or
**Actions → Hyperlane forked integration → Run workflow**. It deliberately does NOT respond to
the `ci` label, so an ordinary CI run never dials a live RPC.

**Run it before any testnet or mainnet deployment.** That is what the test file's own header
asks for, and it is the moment the answer matters. Nothing runs it on a timer, so nothing will
warn you when Hyperlane changes something under you — you find out when you run it, or when a
deployment misbehaves.

### It needs a secret, and says so loudly when it does not have one

The job reads `secrets.OPTIMISM_SEPOLIA_RPC` (any Optimism Sepolia endpoint). Without it the
Solidity test `vm.skip`s itself. Behaviour when the secret is absent:

- **The job FAILS.** That is intentional. A skipped or green job would claim coverage that does
  not exist, and GitHub renders skipped in the same green as passing. You asked for this run, so
  a run that verified nothing must not look like one that did. The failure is true, actionable
  and not flaky, and it goes green the moment the secret is added — or run it locally instead,
  which needs no secret at all.

The job also fails if `forge test` exits 0 while having verified nothing — if `--match-contract`
matches no suite (renamed contract), or if the tests report `[SKIP]` despite the secret being
set (env-var name drift). Exit code 0 alone is not treated as evidence.

**The local run is the one that does not depend on any of this**, and it is the version the
deployment guide asks for:

```bash
cd packages/contracts
OPTIMISM_SEPOLIA_RPC=https://<your-op-sepolia-rpc> \
  forge test --match-contract HyperlaneForked -vv
```

## Run the checks locally

Everything CI does is runnable locally and costs nothing:

```bash
pnpm check                        # lint + typecheck + test + format + syncpack + knip
pnpm turbo lint typecheck test    # the fast subset
cd packages/contracts && forge test
```

Note that `pnpm knip` is advisory locally (the root script passes `--no-exit-code`); CI runs
knip in a form that fails.

## After changing a Solidity contract

Regenerate the committed TypeScript ABIs, or the frontend silently builds against stale ones:

```bash
cd packages/contracts && forge build && pnpm export-abi
pnpm exec prettier --write "packages/abis/src/*.ts"
```

`packages/abis` is intentionally source-only (committed TS, no build step), which is why this
step is manual rather than part of `turbo build`.

## Security headers, and why the web/landing CSP is still Report-Only

`apps/*/vercel.json` carry the response headers. Docs enforces its CSP; **web and landing send
`Content-Security-Policy-Report-Only`**, which blocks nothing. That is an owner decision
recorded as V25 in `PRPs/security-audit-2026-07-30.md`: a naive CSP breaks WalletConnect
(cross-origin frames and websockets) and libp2p WebRTC, so the staged plan is to run
Report-Only, collect real violations, then flip.

**That plan cannot currently execute, and this is the thing to fix.** A Report-Only policy
reports to whatever `report-uri` / `report-to` names, and neither header names anything — so
violations are written to each visitor's own console and nobody ever sees them. The policy is
collecting nothing, which means the evidence needed to flip it will never accumulate on its
own. (Vercel's `vercel.json` is strict JSON with no comment syntax and rejects unknown
top-level keys, which is why this note lives here rather than beside the header.)

To unblock the flip, one of:

- add a `report-to` directive plus a `Reporting-Endpoints` header pointing at a collector
  (Sentry, Report URI, or a small serverless function) — web and landing are static deploys
  today, so this needs an endpoint that does not exist yet; or
- accept a one-off manual pass: browse the app with the console open, exercise WalletConnect
  and the P2P relay flow, and record the violations by hand.

### `connect-src` must list the indexer origin

Every dashboard, search and batch view calls the Ponder indexer at `VITE_INDEXER_URL`. That is
a **different origin** from the app, so it has to appear in `connect-src` in
`apps/web/vercel.json`. Only the local-dev fallback (`http://localhost:42069`) is listed today,
because no production indexer is deployed yet — whoever deploys one must add its origin in the
same change that sets `VITE_INDEXER_URL`, or the dashboard breaks the moment the CSP is
enforced.

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

## CI does not run on your PR unless you ask it to

**This is the single most important thing to know about this repo.**

The checks in `.github/workflows/ci.yml` (contracts, node, ABI drift) are **opt-in**. They have
no `push` trigger and each carries a label gate, so on an ordinary pull request they do not
run — they report **skipped**, which GitHub renders in the same green as a pass. A PR can look
entirely green and have had zero tests, zero lint and zero type checks run against it.

That is a deliberate cost decision (this is a pre-release project and everything below is
runnable locally for free), not an oversight. It only bites if you mistake a skipped check for
a passing one.

### To run CI on a PR

Add the **`ci`** label to it. Remove and re-add the label to re-run.

Or, for a branch without a PR: **Actions → CI → Run workflow** (`workflow_dispatch`).

### Labels this workflow reads

| Label           | Effect                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| `ci`            | Runs the contracts, node and ABI-drift jobs. Without it, none of them run.                 |
| `abi-unchanged` | Skips the always-on ABI freshness check. Only for Solidity edits that cannot alter an ABI. |

The **ABI freshness** job is the one exception: it runs on every PR regardless of labels,
because it is a few seconds of pure git with no toolchain. It only asserts that a PR touching
`packages/contracts/src/**` also touched `packages/abis/src/**` — it does not compile anything,
so it is a guard rail, not a substitute for the labelled `ci` run.

### If these jobs are ever made required status checks

Remove the label gate first. A skipped job satisfies a required check, so "required" would
otherwise mean "required to be skipped".

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

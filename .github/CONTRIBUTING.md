# Contributing

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

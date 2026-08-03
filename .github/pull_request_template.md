<!--
  NOTHING RUNS AUTOMATICALLY. Add the `ci` label to run CI on this PR (remove + re-add to
  re-run). No checks on a PR is the normal state — it does not mean anything passed.
  See .github/CONTRIBUTING.md.
-->

## What & why

<!-- What changed, and what problem it solves. -->

## Checks

- [ ] Ran `pnpm check` locally (and `forge test` if contracts changed), **or** added the
      **`ci`** label
- [ ] Solidity changed → regenerated ABIs (`cd packages/contracts && forge build && pnpm export-abi`,
      then `pnpm exec prettier --write "packages/abis/src/*.ts"`) and committed them
- [ ] Entry-struct fields changed → included the byte-count proof that it still fits in one
      storage slot (see CLAUDE.md, "1-slot storage invariant")

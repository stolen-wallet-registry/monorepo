<!--
  CI IS OPT-IN HERE. Without the `ci` label, the contracts / node / abi-drift jobs do not
  run — they show as "skipped", which looks green. See .github/CONTRIBUTING.md.
-->

## What & why

<!-- What changed, and what problem it solves. -->

## Checks

- [ ] Added the **`ci`** label (or ran CI via Actions → CI → Run workflow), **or** ran
      `pnpm check` locally and `forge test` if contracts changed
- [ ] Solidity changed → regenerated ABIs (`cd packages/contracts && forge build && pnpm export-abi`,
      then `pnpm exec prettier --write "packages/abis/src/*.ts"`) and committed them
- [ ] Entry-struct fields changed → included the byte-count proof that it still fits in one
      storage slot (see CLAUDE.md, "1-slot storage invariant")

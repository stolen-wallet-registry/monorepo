# Vendored Hyperlane interfaces

Source: [`hyperlane-xyz/hyperlane-monorepo`](https://github.com/hyperlane-xyz/hyperlane-monorepo)
Commit: `1a31d0425f060339e1c14980f552c976d408ec91` (`solidity/package.json` version `11.3.1`)

## Why these are vendored rather than a submodule

This repo previously carried `hyperlane-monorepo` as a git submodule pinned to the
`v1.5.8` tag. That tag ships the **Hyperlane v2** `IMailbox`: a non-payable
`dispatch`, no `quoteDispatch`, and the removed `count()` / `root()` /
`latestCheckpoint()` accessors. Every live Base / Optimism Mailbox is v3+, where
`dispatch` is payable and the default post-dispatch hook reverts on zero `msg.value`,
so anything built against the v2 shape reverts on the first real send.

The submodule could not simply be re-pinned: hyperlane-monorepo publishes v3+ only
as npm packages, and its git tags stop at `v1.5.8` (plus two unversioned
`v3-*` markers). The only way to get the current interface from git is to pin an
arbitrary commit on `main`.

We import exactly five files out of a multi-hundred-megabyte polyglot monorepo
(Rust agents, TypeScript SDK, chain configs). Vendoring those five gives a
deterministic pin, a reviewable diff when the interface changes, and removes a
large submodule clone from every CI job.

## Files

| File                                                 | Used by                                      |
| ---------------------------------------------------- | -------------------------------------------- |
| `contracts/interfaces/IMailbox.sol`                  | `HyperlaneAdapter`                           |
| `contracts/interfaces/IMessageRecipient.sol`         | `CrossChainInbox`, `SoulboundReceiver`       |
| `contracts/interfaces/IInterchainSecurityModule.sol` | transitive dep of `IMailbox`                 |
| `contracts/interfaces/hooks/IPostDispatchHook.sol`   | transitive dep of `IMailbox`                 |
| `contracts/hooks/libs/StandardHookMetadata.sol`      | `HyperlaneAdapter` (gas-limit hook metadata) |

Each file carries a provenance header and is byte-identical to upstream apart from
that header and `forge fmt` normalization.

## Refreshing

```bash
UPSTREAM=https://github.com/hyperlane-xyz/hyperlane-monorepo
SHA=<new commit>
git clone --depth 1 --filter=blob:none --sparse $UPSTREAM /tmp/hl
# copy the five files above out of /tmp/hl/solidity/, re-add the provenance
# headers, then:
forge fmt src/vendor/hyperlane
forge test
```

Treat any change to `IMailbox` or `StandardHookMetadata` as a breaking wire-format
change and re-run the forked integration test (`test/HyperlaneForked.t.sol`,
gated on `BASE_SEPOLIA_RPC`).

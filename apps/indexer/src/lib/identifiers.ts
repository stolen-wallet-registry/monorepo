/**
 * Identifier decoding helpers.
 *
 * Registry events carry account/contract identity as a raw `bytes32` with NO namespace
 * (see `IWalletRegistry.WalletRegistered` / `IContractRegistry.ContractRegistered`).
 * `CAIP10.walletKey` in Solidity explicitly supports non-eip155 namespaces (solana,
 * bip122, cosmos) whose identifiers occupy all 32 bytes, so blindly truncating every
 * identifier to its last 20 bytes is lossy: two distinct non-EVM accounts sharing a
 * 20-byte suffix collapse onto the same row.
 *
 * These helpers therefore keep the FULL bytes32 as the row identity and derive a display
 * address only when the identifier is actually EVM-shaped.
 *
 * NOTE (contract-side want): the registries should emit the namespace hash alongside the
 * identifier. Until then `isEvmIdentifier` is a heuristic — a non-EVM key whose top 12
 * bytes happen to be zero is indistinguishable from an EVM address.
 *
 * This module is intentionally pure (no ponder imports) so it can be unit tested.
 */

import type { Address, Hex } from 'viem';

/** A normalized bytes32: lowercase `0x` + 64 hex chars. */
export type Bytes32 = Hex;

/**
 * Lowercase and left-pad an identifier to a full 32 bytes.
 * Throws on values longer than 32 bytes so malformed input fails loudly.
 */
export function normalizeIdentifier(identifier: Hex): Bytes32 {
  const body = identifier.toLowerCase().replace(/^0x/, '');
  if (body.length > 64) {
    throw new Error(`Identifier longer than 32 bytes: ${identifier}`);
  }
  return `0x${body.padStart(64, '0')}` as Bytes32;
}

/**
 * True when the identifier is `bytes32(uint256(uint160(address)))`:
 * the top 12 bytes are zero and the low 20 bytes are non-zero.
 */
export function isEvmIdentifier(identifier: Hex): boolean {
  const body = normalizeIdentifier(identifier).slice(2);
  const prefix = body.slice(0, 24);
  const suffix = body.slice(24);
  return /^0{24}$/.test(prefix) && !/^0{40}$/.test(suffix);
}

/**
 * Decode the EVM address from an identifier, or null when the identifier is not
 * EVM-shaped (non-EVM namespace, or the zero identifier).
 */
export function identifierToAddress(identifier: Hex): Address | null {
  if (!isEvmIdentifier(identifier)) return null;
  return `0x${normalizeIdentifier(identifier).slice(26)}` as Address;
}

/**
 * Unconditionally take the low 20 bytes as an address.
 *
 * Use ONLY where the contract itself truncates unconditionally, so the indexer must
 * mirror it: `ContractRegistry.registerContractsFromOperator` computes its storage key as
 * `address(uint160(uint256(identifier)))` with no namespace branch, so the truncated
 * address IS the on-chain identity for contract entries. Everywhere else (wallets), use
 * `identifierToAddress`, which refuses to truncate non-EVM identifiers.
 */
export function truncateToAddress(identifier: Hex): Address {
  return `0x${normalizeIdentifier(identifier).slice(26)}` as Address;
}

/**
 * `OperatorSubmitter._getOperatorId()` returns `bytes32(uint256(uint160(msg.sender)))`,
 * so the operator address is recoverable from the event's `operatorId` — which is the
 * authoritative submitter, unlike `event.transaction.from` (wrong for any batch relayed
 * through a multisig, AA account, or relayer).
 */
export function operatorIdToAddress(operatorId: Hex): Address | null {
  return identifierToAddress(operatorId);
}

/**
 * CAIP-2 wildcard chain reference used by `CAIP10.walletKey` for eip155.
 * A wallet marked stolen is stolen on EVERY EVM chain, so the canonical identifier for
 * an EVM wallet must not pin one chain.
 */
export const EVM_WILDCARD_CAIP2 = 'eip155:*';

/**
 * Build the display CAIP-10 identifier for a registered wallet.
 *
 * - EVM: `eip155:*:0x…` (wildcard — matches the contract's wildcard storage key).
 * - Non-EVM: `<reportedChainCAIP2>:0x<bytes32>` when the reported chain resolves,
 *   otherwise `unknown:*:0x<bytes32>`. The namespace is not on the event, so this is
 *   the best available reconstruction.
 */
export function walletCaip10(identifier: Hex, reportedChainCAIP2: string | null): string {
  const address = identifierToAddress(identifier);
  if (address) return `${EVM_WILDCARD_CAIP2}:${address}`;
  const prefix = reportedChainCAIP2 ?? 'unknown:*';
  return `${prefix}:${normalizeIdentifier(identifier)}`;
}

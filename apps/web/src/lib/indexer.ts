/**
 * Shared indexer configuration and response-boundary parsing.
 */

import { isAddress, isHash, type Address, type Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export const INDEXER_URL: string = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:42069';

if (import.meta.env.PROD && !import.meta.env.VITE_INDEXER_URL) {
  console.warn('[indexer] VITE_INDEXER_URL not set, using localhost fallback');
}

/**
 * Narrow an address arriving from the indexer.
 *
 * The GraphQL response is typed by hand-written interfaces, so every field is whatever the
 * indexer actually sent — the types describe an expectation, not a guarantee. `raw.operator as
 * Address` asserted that expectation into the type system and silenced the one mechanism that
 * would have reported it wrong: a null, a truncated string, or an ENS name would flow on as an
 * `Address` and fail somewhere unrelated, typically as a broken explorer link on a fraud
 * record. `isAddress` narrows instead of asserting, so the failure surfaces here.
 *
 * @returns The address, or undefined if the value is not one
 */
export function parseIndexerAddress(value: unknown): Address | undefined {
  // `strict: false` disables EIP-55 checksum validation, and that is REQUIRED here, not a
  // relaxation. viem's `isAddress` defaults to strict, which compares the input against its
  // checksummed form — so every all-lowercase address fails it. The indexer stores and returns
  // addresses lowercased, so a strict check would drop every row in every dashboard table.
  // Checksum casing is a typo-detection aid for human-entered text; for machine data off the
  // wire the property we need is shape (0x + 40 hex), which is what this validates. Same choice
  // as `transactionFormStore.ts`.
  return typeof value === 'string' && isAddress(value, { strict: false }) ? value : undefined;
}

/** As {@link parseIndexerAddress}, for transaction hashes. */
export function parseIndexerHash(value: unknown): Hash | undefined {
  return typeof value === 'string' && isHash(value) ? value : undefined;
}

/**
 * Report an indexer row dropped because a required identity field did not parse.
 *
 * Rows are dropped rather than rendered with holes. These tables carry fraud accusations, and a
 * row whose submitter or transaction hash failed to parse cannot be checked by the reader: the
 * explorer link is what makes an entry verifiable, so a row without one asserts wrongdoing while
 * withholding the means to confirm it. Dropping is loud in the log and silent in the UI, which
 * is the right way round — the alternative is an unverifiable accusation on screen.
 *
 * Callers test each field inline (`if (!submitter || !hash) { … continue }`) rather than passing
 * them here, because only an inline check narrows `Address | undefined` to `Address` for the
 * object literal that follows. A helper returning `boolean` type-checks but narrows nothing.
 *
 * @param label - Row type, for the log line
 * @param id - Row id, for the log line
 */
export function logDroppedIndexerRow(label: string, id: string): void {
  logger.ui.warn('Dropped malformed indexer row', { label, id });
}

/** Thrown when a required identity field on an indexer response does not parse. */
export class IndexerDataError extends Error {
  constructor(field: string, id: string) {
    super(`Indexer returned an unusable ${field} for ${id}. The record cannot be displayed.`);
    this.name = 'IndexerDataError';
  }
}

/**
 * Narrow a REQUIRED address, throwing rather than substituting a value.
 *
 * Use on single-record detail views; use {@link parseIndexerAddress} plus
 * {@link logDroppedIndexerRow} on list views. The split is deliberate:
 *
 *  - A **list** ("recent batches", "operators") is a feed. Dropping one malformed row keeps the
 *    rest useful, and the drop is recorded in the log.
 *  - A **detail view** is someone inspecting one specific fraud record, very likely to decide
 *    whether to trust an address. Rendering it with a silently-substituted or absent submitter
 *    would answer that question wrongly. Throwing surfaces `isError` through react-query, which
 *    these views already handle, and matches the registry-wide rule that a lookup fails loudly
 *    rather than returning something that reads as clean.
 */
export function requireIndexerAddress(value: unknown, field: string, id: string): Address {
  const parsed = parseIndexerAddress(value);
  if (!parsed) throw new IndexerDataError(field, id);
  return parsed;
}

/** As {@link requireIndexerAddress}, for transaction hashes. */
export function requireIndexerHash(value: unknown, field: string, id: string): Hash {
  const parsed = parseIndexerHash(value);
  if (!parsed) throw new IndexerDataError(field, id);
  return parsed;
}

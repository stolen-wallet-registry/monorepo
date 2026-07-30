/**
 * Freshness commitment for registration-phase signatures (anti-phishing control V1).
 *
 * The registration signature commits to `blockhash(windowBlock)` for a block at or after the
 * acknowledgement's grace-period start. That block does not exist when the acknowledgement is
 * signed, so the registration signature cannot be produced in the same sitting — which is what
 * makes the two-phase delay real. Without it a phishing page could harvest both signatures
 * seconds apart and submit them itself once the delay elapsed.
 *
 * Only the hash is signed; the block NUMBER travels as unsigned calldata, because the contract
 * recomputes `blockhash(windowBlock)` and compares — a lied-about number simply fails
 * verification.
 *
 * Shared by the wallet and transaction flows: both registries enforce the same three rules, so
 * both resolve the commitment the same way.
 */

import type { PublicClient } from 'viem';
import type { Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

/**
 * How far back `blockhash()` can see on the EVM. The contract rejects
 * `block.number - windowBlock >= 256` with `TimingConfig__WindowBlockTooOld`, so a signature
 * left unsubmitted for this many blocks is dead and must be re-signed.
 */
export const WINDOW_BLOCK_HISTORY_LIMIT = 256n;

export interface WindowBlockCommitment {
  /** Block number whose hash was signed. Travels unsigned in the `register` calldata. */
  windowBlock: bigint;
  /** `blockhash(windowBlock)` — the value actually committed to in the EIP-712 struct. */
  windowBlockHash: Hash;
}

export interface ResolveWindowBlockParams {
  /** Public client for the chain the registration will be submitted on. */
  client: PublicClient | undefined;
  /**
   * The acknowledgement's grace-period start block, when known. The contract rejects a
   * `windowBlock` before it (`TimingConfig__WindowBlockBeforeGracePeriod`); checking here turns
   * that into a readable message instead of a signature the user pays to have reverted.
   */
  gracePeriodStart?: bigint;
}

/**
 * Resolve the `windowBlock` / `windowBlockHash` pair to sign a registration over.
 *
 * Uses `currentBlock - 1` rather than `currentBlock`: the contract requires
 * `windowBlock < block.number`, and the head block is not mined from the contract's point of
 * view by the time the transaction lands.
 *
 * @throws if no client is available, the chain has no mined history yet, the grace period has
 *   not started, or the block has no hash (pending)
 */
export async function resolveWindowBlock({
  client,
  gracePeriodStart,
}: ResolveWindowBlockParams): Promise<WindowBlockCommitment> {
  if (!client) {
    throw new Error('No RPC client available to read the current block. Please try again.');
  }

  const currentBlockNumber = await client.getBlockNumber();
  if (currentBlockNumber === 0n) {
    throw new Error('The chain has no mined blocks yet. Please try again in a moment.');
  }

  const windowBlock = currentBlockNumber - 1n;

  // Should be unreachable: the UI only reaches the register step after the grace period has
  // elapsed. Kept as a hard failure because signing anyway produces a guaranteed revert.
  if (gracePeriodStart !== undefined && gracePeriodStart > 0n && windowBlock < gracePeriodStart) {
    logger.signature.error('Window block precedes the grace period start', {
      windowBlock: windowBlock.toString(),
      gracePeriodStart: gracePeriodStart.toString(),
    });
    throw new Error('The grace period has not finished yet. Please wait before signing.');
  }

  const block = await client.getBlock({ blockNumber: windowBlock });
  if (!block.hash) {
    throw new Error('The reference block has not been mined yet. Please try again.');
  }

  logger.signature.debug('Resolved registration window block', {
    currentBlockNumber: currentBlockNumber.toString(),
    windowBlock: windowBlock.toString(),
    windowBlockHash: block.hash,
  });

  return { windowBlock, windowBlockHash: block.hash as Hash };
}

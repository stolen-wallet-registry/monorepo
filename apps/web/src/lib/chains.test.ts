import { describe, it, expect } from 'vitest';
import { getChainDisplayFromCaip2 } from './chains';

/**
 * Chain-badge rendering, including the CAIP-2 wildcard.
 *
 * Registered wallets are keyed chain-wildcarded on purpose — a wallet marked stolen is stolen
 * on every EVM chain, matching `CAIP10.walletKey` in Solidity — so the indexer stores their
 * identifier as `eip155:*:0x…`. Any UI that derived a chain by splitting that string got the
 * literal `*`, which rendered as a globe labelled "eip155:*" with no explorer link. The fix is
 * two-part: consumers read `reportedChainCAIP2` instead of parsing the identifier, and the
 * wildcard renders as a statement rather than raw CAIP-2 when it does reach the display layer.
 */
describe('getChainDisplayFromCaip2', () => {
  it('resolves a known chain to its real name and id', () => {
    const info = getChainDisplayFromCaip2('eip155:8453');

    expect(info.chainId).toBe(8453);
    expect(info.isKnown).toBe(true);
    // An explorer link is only possible when chainId resolves — this is what the wildcard lost.
    expect(info.chainId).not.toBeNull();
  });

  it('renders the EVM wildcard as a statement, never as raw CAIP-2', () => {
    const info = getChainDisplayFromCaip2('eip155:*');

    expect(info.displayName).toBe('All EVM chains');
    expect(info.shortName).toBe('All EVM chains');
    expect(info.displayName).not.toContain('*');
    // No chainId: there is no single chain to link an explorer at, which is correct here.
    expect(info.chainId).toBeNull();
  });

  it('renders a non-EVM wildcard with its namespace', () => {
    const info = getChainDisplayFromCaip2('solana:*');

    expect(info.displayName).toBe('All solana chains');
    expect(info.chainId).toBeNull();
  });

  it('still reports unknown for a missing identifier', () => {
    const info = getChainDisplayFromCaip2(undefined);

    expect(info.displayName).toBe('Unknown');
    expect(info.chainId).toBeNull();
  });
});

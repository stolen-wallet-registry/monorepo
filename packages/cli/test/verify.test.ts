import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `swr verify` prints a fraud verdict about a third party. What it claims the verdict COVERS
 * is part of that verdict.
 *
 * The wallet lookup (`isWalletRegistered(address)`) takes no chain argument — the registry's
 * wallet key is chain-wildcarded, so a wallet marked stolen is stolen on every EVM chain. The
 * command nonetheless echoed `Chain ID: <whatever -c said>` next to the answer, which reads as
 * "checked on chain N" for a query that never mentioned chain N. An operator confirming
 * "Chain ID: 1 / Registered: No" concluded the wallet was clean on Ethereum; the registry had
 * been asked a different question, and would have said the same thing for every chain.
 */

const readContract = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract }),
    http: () => ({}),
  };
});

vi.mock('../src/lib/config.js', () => ({
  getConfig: () => ({
    chain: { id: 8453, name: 'Base' },
    rpcUrl: 'http://rpc.test',
    contracts: {
      stolenWalletRegistry: '0x1111111111111111111111111111111111111111',
      fraudulentContractRegistry: '0x2222222222222222222222222222222222222222',
    },
  }),
}));

const { verify } = await import('../src/commands/verify.js');

const ADDRESS = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';

let logged: string[];
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = [];
  readContract.mockReset();
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  logSpy.mockRestore();
});

const output = () => logged.join('\n');

describe('verify — wallet', () => {
  beforeEach(() => {
    // isWalletRegistered, then isWalletPending.
    readContract.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
  });

  it('reports the wildcard chain reference, not the chain the caller passed', async () => {
    await verify({ address: ADDRESS, env: 'local', chainId: 1, type: 'wallet' });

    expect(output()).toContain('eip155:*');
    // The specific regression: the requested chain must not be presented as the scope of the
    // answer, in any form.
    expect(output()).not.toMatch(/Chain ID: 1\b/);
  });

  it('says the scope is chain-wide so a negative is not read as per-chain', async () => {
    await verify({ address: ADDRESS, env: 'local', chainId: 10, type: 'wallet' });

    expect(output()).toMatch(/chain-wide/i);
  });

  it('does not pass a chain argument to the wallet lookup', async () => {
    await verify({ address: ADDRESS, env: 'local', chainId: 10, type: 'wallet' });

    // Pins the reason the label changed: the contract call is address-only. If a chain-scoped
    // wallet lookup is ever added, this fails and the label has to be revisited with it.
    for (const call of readContract.mock.calls) {
      expect(call[0].args).toEqual([ADDRESS]);
    }
  });

  it('still reports a positive result', async () => {
    readContract.mockReset();
    readContract.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await verify({ address: ADDRESS, env: 'local', chainId: 1, type: 'wallet' });

    expect(output()).toContain('YES - STOLEN');
  });

  it('rejects an address that is not an address before querying anything', async () => {
    await expect(
      verify({ address: '0xnope', env: 'local', chainId: 1, type: 'wallet' })
    ).rejects.toThrow(/Invalid address/);
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe('verify — contract', () => {
  // The contract registry IS chain-scoped: its key is (address, chainIdHash), so the chain
  // genuinely qualifies the answer here and must stay on the output.
  it('keeps the chain ID, which does qualify a contract lookup', async () => {
    readContract.mockResolvedValueOnce(false);

    await verify({ address: ADDRESS, env: 'local', chainId: 10, type: 'contract' });

    expect(output()).toContain('Chain ID: 10');
  });

  it('passes the chain hash to the contract lookup', async () => {
    readContract.mockResolvedValueOnce(true);

    await verify({ address: ADDRESS, env: 'local', chainId: 10, type: 'contract' });

    expect(readContract.mock.calls[0]?.[0].args).toHaveLength(2);
    expect(output()).toContain('YES - FRAUDULENT');
  });
});

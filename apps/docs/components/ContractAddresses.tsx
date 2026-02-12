import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import {
  allNetworks,
  getExplorerAddressUrl,
  type HubNetworkConfig,
  type SpokeNetworkConfig,
} from '@swr/chains';

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9em',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #e2e8f0',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #e2e8f0',
};

const monoTdStyle: React.CSSProperties = {
  ...tdStyle,
  fontFamily: 'monospace',
  fontSize: '0.85em',
};

function CopyableAddress({ address, chainId }: { address: string; chainId: number }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const url = getExplorerAddressUrl(chainId, address) ?? undefined;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(address).then(
      () => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        // Clipboard API unavailable or denied — silently ignore
      }
    );
  };

  return (
    <td style={monoTdStyle}>
      <span
        onClick={handleCopy}
        title="Click to copy"
        style={{ cursor: 'pointer', userSelect: 'all' }}
      >
        {address}
      </span>
      {copied && <span style={{ color: '#22c55e', marginLeft: 6, fontSize: '0.8em' }}>copied</span>}
      {url && (
        <>
          {' '}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.8em', opacity: 0.6 }}
          >
            ↗
          </a>
        </>
      )}
    </td>
  );
}

type HubContractKey = keyof NonNullable<HubNetworkConfig['hubContracts']>;

const hubContractDefs: { label: string; key: HubContractKey }[] = [
  { label: 'Registry Hub', key: 'registryHub' },
  { label: 'Wallet Registry', key: 'stolenWalletRegistry' },
  { label: 'Transaction Registry', key: 'stolenTransactionRegistry' },
  { label: 'Contract Registry', key: 'fraudulentContractRegistry' },
  { label: 'Cross-Chain Inbox', key: 'crossChainInbox' },
  { label: 'Operator Registry', key: 'operatorRegistry' },
  { label: 'Operator Submitter', key: 'operatorSubmitter' },
  { label: 'Fee Manager', key: 'feeManager' },
  { label: 'Wallet Soulbound', key: 'walletSoulbound' },
  { label: 'Support Soulbound', key: 'supportSoulbound' },
  { label: 'Soulbound Receiver', key: 'soulboundReceiver' },
];

function HubTable({ hubs }: { hubs: HubNetworkConfig[] }) {
  if (hubs.length === 0) return <p>No hub deployments found.</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Contract</th>
            {hubs.map((h) => (
              <th key={h.chainId} style={thStyle}>
                {h.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hubContractDefs.map(({ label, key }) => {
            const anyHasContract = hubs.some((h) => h.hubContracts?.[key]);
            if (!anyHasContract) return null;

            return (
              <tr key={key}>
                <td style={tdStyle}>{label}</td>
                {hubs.map((h) => {
                  const addr = h.hubContracts?.[key];
                  return addr ? (
                    <CopyableAddress key={h.chainId} address={addr as string} chainId={h.chainId} />
                  ) : (
                    <td key={h.chainId} style={tdStyle}>
                      -
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const spokeContractDefs = [
  { label: 'Spoke Registry', getter: (s: SpokeNetworkConfig) => s.spokeContracts?.spokeRegistry },
  { label: 'Fee Manager', getter: (s: SpokeNetworkConfig) => s.spokeContracts?.feeManager },
  {
    label: 'Hyperlane Adapter',
    getter: (s: SpokeNetworkConfig) => s.spokeContracts?.bridgeAdapters?.hyperlane,
  },
];

function SpokeTable({ spokes }: { spokes: SpokeNetworkConfig[] }) {
  if (spokes.length === 0) return <p>No spoke deployments found.</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Contract</th>
            {spokes.map((s) => (
              <th key={s.chainId} style={thStyle}>
                {s.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spokeContractDefs.map(({ label, getter }) => (
            <tr key={label}>
              <td style={tdStyle}>{label}</td>
              {spokes.map((s) => {
                const addr = getter(s);
                return addr ? (
                  <CopyableAddress key={s.chainId} address={addr} chainId={s.chainId} />
                ) : (
                  <td key={s.chainId} style={tdStyle}>
                    -
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HubContracts() {
  const deployedHubs = allNetworks.filter(
    (n): n is HubNetworkConfig => n.role === 'hub' && !n.isLocal && n.hubContracts !== null
  );

  const localHubs = allNetworks.filter(
    (n): n is HubNetworkConfig => n.role === 'hub' && n.isLocal && n.hubContracts !== null
  );

  return (
    <>
      {deployedHubs.length > 0 ? (
        <HubTable hubs={deployedHubs} />
      ) : (
        <p>
          <em>No testnet or mainnet hub deployments yet.</em>
        </p>
      )}
      {localHubs.length > 0 && (
        <>
          <h4>Local Development</h4>
          <p>
            These addresses are from <code>pnpm deploy:crosschain</code> using deterministic Anvil
            deployer nonces. Click any address to copy.
          </p>
          <HubTable hubs={localHubs} />
        </>
      )}
    </>
  );
}

export function SpokeContracts() {
  const deployedSpokes = allNetworks.filter(
    (n): n is SpokeNetworkConfig => n.role === 'spoke' && !n.isLocal && n.spokeContracts !== null
  );

  const localSpokes = allNetworks.filter(
    (n): n is SpokeNetworkConfig => n.role === 'spoke' && n.isLocal && n.spokeContracts !== null
  );

  return (
    <>
      {deployedSpokes.length > 0 ? (
        <SpokeTable spokes={deployedSpokes} />
      ) : (
        <p>
          <em>No testnet or mainnet spoke deployments yet.</em>
        </p>
      )}
      {localSpokes.length > 0 && (
        <>
          <h4>Local Development</h4>
          <p>
            These addresses are from <code>pnpm deploy:crosschain</code> using deterministic Anvil
            deployer nonces. Click any address to copy.
          </p>
          <SpokeTable spokes={localSpokes} />
        </>
      )}
    </>
  );
}

export function NetworkOverview() {
  const deployed = allNetworks.filter((n) => !n.isLocal);
  const local = allNetworks.filter((n) => n.isLocal);

  return (
    <>
      {deployed.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Network</th>
                <th style={thStyle}>Chain ID</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Type</th>
              </tr>
            </thead>
            <tbody>
              {deployed.map((n) => (
                <tr key={n.chainId}>
                  <td style={tdStyle}>{n.displayName}</td>
                  <td style={monoTdStyle}>{n.chainId}</td>
                  <td style={tdStyle}>{n.role}</td>
                  <td style={tdStyle}>{n.isTestnet ? 'Testnet' : 'Mainnet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          <em>
            No testnet or mainnet deployments yet. Testnet deployment (Base Sepolia, OP Sepolia) is
            in progress.
          </em>
        </p>
      )}

      {local.length > 0 && (
        <>
          <h4>Local Development Chains</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Network</th>
                  <th style={thStyle}>Chain ID</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>RPC</th>
                </tr>
              </thead>
              <tbody>
                {local.map((n) => (
                  <tr key={n.chainId}>
                    <td style={tdStyle}>{n.displayName}</td>
                    <td style={monoTdStyle}>{n.chainId}</td>
                    <td style={tdStyle}>{n.role}</td>
                    <td style={monoTdStyle}>{n.rpcUrls?.[0] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

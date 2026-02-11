import React from 'react';
import {
  allNetworks,
  getExplorerAddressUrl,
  type HubNetworkConfig,
  type SpokeNetworkConfig,
} from '@swr/chains';

function truncate(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function AddressCell({ address, chainId }: { address: string; chainId: number }) {
  const url = getExplorerAddressUrl(chainId, address);
  return (
    <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
      <a href={url} target="_blank" rel="noopener noreferrer" title={address}>
        {truncate(address)}
      </a>
    </td>
  );
}

export function HubContracts() {
  const hubs = allNetworks.filter(
    (n): n is HubNetworkConfig => n.role === 'hub' && !n.isLocal && n.hubContracts !== null
  );

  if (hubs.length === 0) return <p>No hub deployments found.</p>;

  const contracts = [
    { label: 'Registry Hub', key: 'registryHub' },
    { label: 'Wallet Registry', key: 'stolenWalletRegistry' },
    { label: 'Transaction Registry', key: 'stolenTransactionRegistry' },
    { label: 'Contract Registry', key: 'fraudulentContractRegistry' },
    { label: 'Cross-Chain Inbox', key: 'crossChainInbox' },
    { label: 'Operator Registry', key: 'operatorRegistry' },
    { label: 'Operator Submitter', key: 'operatorSubmitter' },
    { label: 'Fee Manager', key: 'feeManager' },
    { label: 'Wallet Soulbound', key: 'walletSoulbound' },
  ] as const;

  return (
    <table>
      <thead>
        <tr>
          <th>Contract</th>
          {hubs.map((h) => (
            <th key={h.chainId}>{h.displayName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {contracts.map(({ label, key }) => (
          <tr key={key}>
            <td>{label}</td>
            {hubs.map((h) => {
              const addr = h.hubContracts?.[key as keyof typeof h.hubContracts];
              return addr ? (
                <AddressCell key={h.chainId} address={addr as string} chainId={h.chainId} />
              ) : (
                <td key={h.chainId}>-</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SpokeContracts() {
  const spokes = allNetworks.filter(
    (n): n is SpokeNetworkConfig => n.role === 'spoke' && !n.isLocal && n.spokeContracts !== null
  );

  if (spokes.length === 0) return <p>No spoke deployments found.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Contract</th>
          {spokes.map((s) => (
            <th key={s.chainId}>{s.displayName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Spoke Registry</td>
          {spokes.map((s) => {
            const addr = s.spokeContracts?.spokeRegistry;
            return addr ? (
              <AddressCell key={s.chainId} address={addr} chainId={s.chainId} />
            ) : (
              <td key={s.chainId}>-</td>
            );
          })}
        </tr>
        <tr>
          <td>Fee Manager</td>
          {spokes.map((s) => {
            const addr = s.spokeContracts?.feeManager;
            return addr ? (
              <AddressCell key={s.chainId} address={addr} chainId={s.chainId} />
            ) : (
              <td key={s.chainId}>-</td>
            );
          })}
        </tr>
        <tr>
          <td>Hyperlane Adapter</td>
          {spokes.map((s) => {
            const addr = s.spokeContracts?.bridgeAdapters?.hyperlane;
            return addr ? (
              <AddressCell key={s.chainId} address={addr} chainId={s.chainId} />
            ) : (
              <td key={s.chainId}>-</td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

export function NetworkOverview() {
  const nonLocal = allNetworks.filter((n) => !n.isLocal);

  return (
    <table>
      <thead>
        <tr>
          <th>Network</th>
          <th>Chain ID</th>
          <th>Role</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        {nonLocal.map((n) => (
          <tr key={n.chainId}>
            <td>{n.displayName}</td>
            <td style={{ fontFamily: 'monospace' }}>{n.chainId}</td>
            <td>{n.role}</td>
            <td>{n.isTestnet ? 'Testnet' : 'Mainnet'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

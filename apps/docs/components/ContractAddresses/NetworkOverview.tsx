import { allNetworks } from '@swr/chains';

import { tableStyle, thStyle, tdStyle, monoTdStyle } from './styles';

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

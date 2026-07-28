import { type SpokeNetworkConfig } from '@swr/chains';

import { CopyableAddress } from './CopyableAddress';
import { tableStyle, thStyle, tdStyle } from './styles';

const spokeContractDefs = [
  { label: 'Spoke Registry', getter: (s: SpokeNetworkConfig) => s.spokeContracts?.spokeRegistry },
  { label: 'Fee Manager', getter: (s: SpokeNetworkConfig) => s.spokeContracts?.feeManager },
  {
    label: 'Hyperlane Adapter',
    getter: (s: SpokeNetworkConfig) => s.spokeContracts?.bridgeAdapters?.hyperlane,
  },
];

export function SpokeTable({ spokes }: { spokes: SpokeNetworkConfig[] }) {
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

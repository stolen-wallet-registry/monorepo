import { type HubNetworkConfig } from '@swr/chains';

import { CopyableAddress } from './CopyableAddress';
import { tableStyle, thStyle, tdStyle } from './styles';

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

export function HubTable({ hubs }: { hubs: HubNetworkConfig[] }) {
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

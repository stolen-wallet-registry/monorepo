import { CopyableAddress } from './CopyableAddress';
import { tableStyle, thStyle, tdStyle } from './styles';

/** The shape both hub and spoke network configs share for table rendering. */
interface TableNetwork {
  chainId: number;
  displayName: string;
}

export interface ContractDef<T> {
  label: string;
  /** Reads this contract's address off a network config; undefined if not deployed there. */
  getter: (network: T) => string | undefined;
}

interface ContractTableProps<T extends TableNetwork> {
  networks: T[];
  defs: ContractDef<T>[];
  /** Shown instead of the table when there are no deployments. */
  emptyMessage: string;
}

/**
 * One contract per row, one network per column.
 *
 * Hub and spoke used to have separate copies of this, which drifted: only the hub copy
 * skipped rows no network had deployed, so the spoke table rendered all-dash rows.
 */
export function ContractTable<T extends TableNetwork>({
  networks,
  defs,
  emptyMessage,
}: ContractTableProps<T>) {
  if (networks.length === 0) return <p>{emptyMessage}</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Contract</th>
            {networks.map((n) => (
              <th key={n.chainId} style={thStyle}>
                {n.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {defs.map(({ label, getter }) => {
            // A contract no network in this group has deployed contributes nothing but a
            // row of dashes.
            if (!networks.some((n) => getter(n))) return null;

            return (
              <tr key={label}>
                <td style={tdStyle}>{label}</td>
                {networks.map((n) => {
                  const addr = getter(n);
                  return addr ? (
                    <CopyableAddress key={n.chainId} address={addr} chainId={n.chainId} />
                  ) : (
                    <td key={n.chainId} style={tdStyle}>
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

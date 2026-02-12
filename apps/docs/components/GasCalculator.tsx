import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';

const GAS_PER_ENTRY = 21_500;
const BATCH_OVERHEAD = 50_000;
const BATCH_SIZES = [50, 100, 200, 500, 1_000, 2_000, 5_000];

const DEFAULTS = {
  gasPriceGwei: 0.002,
  ethPriceUsd: 3_000,
};

function fmtUsd(n: number): string {
  if (n < 0.001 && n > 0) return '<$0.001';
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: n < 1 ? 4 : 2,
    })
  );
}

/** Show full decimal ETH values (e.g. 0.0000022) — no scientific notation */
function fmtEth(n: number): string {
  if (n === 0) return '0';
  // Count leading zeros after decimal to determine precision
  const str = n.toFixed(20);
  const match = str.match(/^0\.(0*)/);
  const leadingZeros = match?.[1]?.length ?? 0;
  // Show 2 significant digits after the leading zeros
  return n.toFixed(Math.min(leadingZeros + 2, 18));
}

interface Row {
  batchSize: number;
  entryGas: number;
  totalGas: number;
  costEth: number;
  costUsd: number;
}

export function GasCalculator() {
  const [gasPriceGwei, setGasPriceGwei] = useState(DEFAULTS.gasPriceGwei);
  const [ethPriceUsd, setEthPriceUsd] = useState(DEFAULTS.ethPriceUsd);

  const rows: Row[] = useMemo(
    () =>
      BATCH_SIZES.map((batchSize) => {
        const entryGas = batchSize * GAS_PER_ENTRY;
        const totalGas = entryGas + BATCH_OVERHEAD;
        const costEth = totalGas * gasPriceGwei * 1e-9;
        const costUsd = costEth * ethPriceUsd;
        return { batchSize, entryGas, totalGas, costEth, costUsd };
      }),
    [gasPriceGwei, ethPriceUsd]
  );

  const inputStyle: CSSProperties = {
    padding: '6px 10px',
    border: '1px solid var(--vocs-color_border)',
    borderRadius: '6px',
    background: 'var(--vocs-color_background)',
    color: 'var(--vocs-color_text)',
    fontSize: '14px',
    width: '140px',
  };

  const labelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
    color: 'var(--vocs-color_text2)',
  };

  const th: CSSProperties = {
    padding: '8px 12px',
    borderBottom: '2px solid var(--vocs-color_border)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--vocs-color_text2)',
    textAlign: 'right',
  };

  const td: CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid var(--vocs-color_border)',
    fontSize: '14px',
    fontFamily: 'monospace',
    textAlign: 'right',
  };

  return (
    <div
      style={{
        border: '1px solid var(--vocs-color_border)',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '16px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <label style={labelStyle}>
          <span>Gas price (gwei)</span>
          <input
            type="number"
            min={0}
            step={0.001}
            value={gasPriceGwei}
            onChange={(e) => setGasPriceGwei(Math.max(0, Number(e.target.value)))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span>ETH price (USD)</span>
          <input
            type="number"
            min={1}
            value={ethPriceUsd}
            onChange={(e) => setEthPriceUsd(Math.max(1, Number(e.target.value)))}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Batch Size</th>
              <th style={th}>Entry Gas</th>
              <th style={th}>Total Gas*</th>
              <th style={th}>Cost (ETH)</th>
              <th style={th}>Cost (USD)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.batchSize}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  {row.batchSize.toLocaleString()}
                </td>
                <td style={td}>{row.entryGas.toLocaleString()}</td>
                <td style={td}>{row.totalGas.toLocaleString()}</td>
                <td style={td}>{fmtEth(row.costEth)}</td>
                <td style={td}>{fmtUsd(row.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--vocs-color_text3)', marginTop: '12px' }}>
        *Total gas includes ~{BATCH_OVERHEAD.toLocaleString()} batch overhead (summary event +
        metadata). Gas per entry: ~{GAS_PER_ENTRY.toLocaleString()} (SSTORE + event). Default gas
        price is Base&apos;s EIP-1559 floor (0.002 gwei). Check{' '}
        <a
          href="https://basescan.org/gastracker"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--vocs-color_textAccent)' }}
        >
          BaseScan Gas Tracker
        </a>{' '}
        for current gas prices and{' '}
        <a
          href="https://www.coingecko.com/en/coins/ethereum"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--vocs-color_textAccent)' }}
        >
          CoinGecko
        </a>{' '}
        for current ETH price.
      </p>
    </div>
  );
}

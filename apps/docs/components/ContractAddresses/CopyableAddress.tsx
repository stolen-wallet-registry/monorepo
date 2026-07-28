import { useState, useRef, useEffect } from 'react';
import { getExplorerAddressUrl } from '@swr/chains';

import { monoTdStyle } from './styles';

export function CopyableAddress({ address, chainId }: { address: string; chainId: number }) {
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
      <button
        type="button"
        onClick={handleCopy}
        title="Click to copy"
        aria-label={`Copy address ${address}`}
        style={{
          cursor: 'pointer',
          userSelect: 'all',
          // Strip the UA button chrome so this still reads as inline monospace text.
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: 'inherit',
        }}
      >
        {address}
      </button>
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

import type React from 'react';

/**
 * Shared inline table styles for the deployment tables.
 *
 * Inline rather than Tailwind: these components render inside Vocs-generated
 * MDX pages, which do not share this app's stylesheet pipeline.
 */

export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9em',
};

export const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #e2e8f0',
  fontWeight: 600,
};

export const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #e2e8f0',
};

export const monoTdStyle: React.CSSProperties = {
  ...tdStyle,
  fontFamily: 'monospace',
  fontSize: '0.85em',
};

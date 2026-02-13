/**
 * Soulbound token SVG previews for the docs site.
 *
 * Uses the shared SoulboundSvgPreview from @swr/ui — the single source of truth
 * that mirrors the on-chain SVGRenderer.sol output. This prevents the docs previews
 * from drifting out of sync with the actual on-chain rendering.
 */

import { SoulboundSvgPreview } from '@swr/ui';

const PREVIEW_SIZE = 320;

export function SoulboundPreviews() {
  return (
    <div style={{ margin: '24px 0' }}>
      {/* English (default) previews */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: '32px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <SoulboundSvgPreview type="wallet" size={PREVIEW_SIZE} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>Wallet Soulbound (SWRW)</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SoulboundSvgPreview type="support" size={PREVIEW_SIZE} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>Support Soulbound (SWRS)</p>
        </div>
      </div>

      {/* Internationalized (Spanish) previews */}
      <p
        style={{
          fontSize: '0.85em',
          color: '#888',
          marginBottom: '12px',
          fontStyle: 'italic',
          textAlign: 'center',
        }}
      >
        Internationalized example — Spanish browser renders localized text below English
      </p>
      <div
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <SoulboundSvgPreview type="wallet" language="es" size={PREVIEW_SIZE} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>
            Wallet Soulbound — es (Spanish)
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SoulboundSvgPreview type="support" language="es" size={PREVIEW_SIZE} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>
            Support Soulbound — es (Spanish)
          </p>
        </div>
      </div>
    </div>
  );
}

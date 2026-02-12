/**
 * Static soulbound token SVG previews for the docs site.
 * Mirrors the on-chain SVGRenderer.sol output.
 */

const DOMAIN = 'stolenwallet.xyz';
const PREVIEW_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const PREVIEW_TOKEN_ID = '42';
const PREVIEW_DONATION = '0.01 ETH';

function WalletSvg({ size = 350 }: { size?: number }) {
  const text1 = `${DOMAIN} - ${DOMAIN} - ${DOMAIN}`;
  const text2 = 'STOLEN WALLET - STOLEN WALLET - STOLEN WALLET';

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path
          id="wp"
          d="M200 12 H372 A16 16 0 0 1 388 28 V372 A16 16 0 0 1 372 388 H28 A16 16 0 0 1 12 372 V28 A16 16 0 0 1 28 12 H200"
        />
      </defs>
      <rect width="400" height="400" rx="20" fill="#000" stroke="#fff" strokeWidth="1" />
      <rect
        x="20"
        y="20"
        width="360"
        height="360"
        rx="20"
        fill="#111"
        stroke="#333"
        strokeWidth="1"
      />
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#wp">
          <animate
            attributeName="startOffset"
            from="0%"
            to="100%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text1}
        </textPath>
      </text>
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#wp" startOffset="50%">
          <animate
            attributeName="startOffset"
            from="50%"
            to="150%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text2}
        </textPath>
      </text>
      <g fontFamily="monospace">
        <text x="200" y="110" textAnchor="middle" fill="#fff" fontSize="16">
          STOLEN WALLET
        </text>
        <text x="200" y="135" textAnchor="middle" fill="#fff" fontSize="12">
          Signed as stolen
        </text>
        <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="11">
          {PREVIEW_ADDRESS}
        </text>
        <text x="200" y="240" textAnchor="middle" fill="#fff" fontSize="12">
          WALLET #{PREVIEW_TOKEN_ID}
        </text>
        <text x="200" y="320" textAnchor="middle" fill="#fff" fontSize="11">
          {DOMAIN}
        </text>
        <text x="200" y="360" textAnchor="middle" fill="#fff" fontSize="10">
          Stolen Wallet Registry
        </text>
      </g>
    </svg>
  );
}

function SupportSvg({ size = 350 }: { size?: number }) {
  const text1 = `${DOMAIN} - ${DOMAIN} - ${DOMAIN}`;
  const text2 = 'THANK YOU - THANK YOU - THANK YOU';

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path
          id="sp"
          d="M200 12 H372 A16 16 0 0 1 388 28 V372 A16 16 0 0 1 372 388 H28 A16 16 0 0 1 12 372 V28 A16 16 0 0 1 28 12 H200"
        />
      </defs>
      <rect width="400" height="400" rx="20" fill="#000" stroke="#fff" strokeWidth="1" />
      <rect
        x="20"
        y="20"
        width="360"
        height="360"
        rx="20"
        fill="#111"
        stroke="#333"
        strokeWidth="1"
      />
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#sp">
          <animate
            attributeName="startOffset"
            from="0%"
            to="100%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text1}
        </textPath>
      </text>
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#sp" startOffset="50%">
          <animate
            attributeName="startOffset"
            from="50%"
            to="150%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text2}
        </textPath>
      </text>
      <g fontFamily="monospace">
        <text x="200" y="110" textAnchor="middle" fill="#fff" fontSize="16">
          SUPPORTER
        </text>
        <text x="200" y="135" textAnchor="middle" fill="#fff" fontSize="12">
          Thank you for your support
        </text>
        <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="24">
          {PREVIEW_DONATION}
        </text>
        <text x="200" y="250" textAnchor="middle" fill="#fff" fontSize="11">
          {PREVIEW_ADDRESS}
        </text>
        <text x="200" y="280" textAnchor="middle" fill="#fff" fontSize="12">
          TOKEN #{PREVIEW_TOKEN_ID}
        </text>
        <text x="200" y="320" textAnchor="middle" fill="#fff" fontSize="11">
          {DOMAIN}
        </text>
        <text x="200" y="360" textAnchor="middle" fill="#fff" fontSize="10">
          Stolen Wallet Registry
        </text>
      </g>
    </svg>
  );
}

function WalletSvgI18n({ size = 350 }: { size?: number }) {
  const text1 = `${DOMAIN} - ${DOMAIN} - ${DOMAIN}`;
  const text2 = 'CARTERA ROBADA - CARTERA ROBADA - CARTERA ROBADA';

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path
          id="ip"
          d="M200 12 H372 A16 16 0 0 1 388 28 V372 A16 16 0 0 1 372 388 H28 A16 16 0 0 1 12 372 V28 A16 16 0 0 1 28 12 H200"
        />
      </defs>
      <rect width="400" height="400" rx="20" fill="#000" stroke="#fff" strokeWidth="1" />
      <rect
        x="20"
        y="20"
        width="360"
        height="360"
        rx="20"
        fill="#111"
        stroke="#333"
        strokeWidth="1"
      />
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#ip">
          <animate
            attributeName="startOffset"
            from="0%"
            to="100%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text1}
        </textPath>
      </text>
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#ip" startOffset="50%">
          <animate
            attributeName="startOffset"
            from="50%"
            to="150%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text2}
        </textPath>
      </text>
      <g fontFamily="monospace">
        <text x="200" y="95" textAnchor="middle" fill="#fff" fontSize="16">
          STOLEN WALLET
        </text>
        <text x="200" y="115" textAnchor="middle" fill="#888" fontSize="13">
          CARTERA ROBADA
        </text>
        <text x="200" y="145" textAnchor="middle" fill="#fff" fontSize="12">
          Signed as stolen
        </text>
        <text x="200" y="162" textAnchor="middle" fill="#888" fontSize="11">
          Firmado como robado
        </text>
        <text x="200" y="205" textAnchor="middle" fill="#fff" fontSize="11">
          {PREVIEW_ADDRESS}
        </text>
        <text x="200" y="240" textAnchor="middle" fill="#fff" fontSize="12">
          WALLET #{PREVIEW_TOKEN_ID}
        </text>
        <text x="200" y="300" textAnchor="middle" fill="#888" fontSize="10">
          No envie fondos a esta direccion
        </text>
        <text x="200" y="325" textAnchor="middle" fill="#fff" fontSize="11">
          {DOMAIN}
        </text>
        <text x="200" y="360" textAnchor="middle" fill="#888" fontSize="10">
          Registro de Carteras Robadas
        </text>
      </g>
    </svg>
  );
}

function SupportSvgI18n({ size = 350 }: { size?: number }) {
  const text1 = `${DOMAIN} - ${DOMAIN} - ${DOMAIN}`;
  const text2 = 'GRACIAS - GRACIAS - GRACIAS - GRACIAS';

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path
          id="sip"
          d="M200 12 H372 A16 16 0 0 1 388 28 V372 A16 16 0 0 1 372 388 H28 A16 16 0 0 1 12 372 V28 A16 16 0 0 1 28 12 H200"
        />
      </defs>
      <rect width="400" height="400" rx="20" fill="#000" stroke="#fff" strokeWidth="1" />
      <rect
        x="20"
        y="20"
        width="360"
        height="360"
        rx="20"
        fill="#111"
        stroke="#333"
        strokeWidth="1"
      />
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#sip">
          <animate
            attributeName="startOffset"
            from="0%"
            to="100%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text1}
        </textPath>
      </text>
      <text fill="#fff" fontSize="10" fontFamily="monospace">
        <textPath href="#sip" startOffset="50%">
          <animate
            attributeName="startOffset"
            from="50%"
            to="150%"
            dur="60s"
            repeatCount="indefinite"
          />
          {text2}
        </textPath>
      </text>
      <g fontFamily="monospace">
        <text x="200" y="95" textAnchor="middle" fill="#fff" fontSize="16">
          SUPPORTER
        </text>
        <text x="200" y="115" textAnchor="middle" fill="#888" fontSize="13">
          PARTIDARIO
        </text>
        <text x="200" y="145" textAnchor="middle" fill="#fff" fontSize="12">
          Thank you for your support
        </text>
        <text x="200" y="162" textAnchor="middle" fill="#888" fontSize="11">
          Gracias por tu apoyo
        </text>
        <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="24">
          {PREVIEW_DONATION}
        </text>
        <text x="200" y="245" textAnchor="middle" fill="#fff" fontSize="11">
          {PREVIEW_ADDRESS}
        </text>
        <text x="200" y="275" textAnchor="middle" fill="#fff" fontSize="12">
          TOKEN #{PREVIEW_TOKEN_ID}
        </text>
        <text x="200" y="325" textAnchor="middle" fill="#fff" fontSize="11">
          {DOMAIN}
        </text>
        <text x="200" y="360" textAnchor="middle" fill="#888" fontSize="10">
          Registro de Carteras Robadas
        </text>
      </g>
    </svg>
  );
}

export function SoulboundPreviews() {
  return (
    <div style={{ margin: '24px 0' }}>
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
          <WalletSvg size={320} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>Wallet Soulbound (SWRW)</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SupportSvg size={320} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>Support Soulbound (SWRS)</p>
        </div>
      </div>
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
          <WalletSvgI18n size={320} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>
            Wallet Soulbound — es (Spanish)
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <SupportSvgI18n size={320} />
          <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>
            Support Soulbound — es (Spanish)
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Soulbound SVG preview component.
 *
 * Renders an animated SVG preview of a soulbound token with:
 * - Animated text rotating around the border
 * - Language-specific text in the center
 */

import { cn } from '@/lib/utils';
import { getLanguageName, getLanguageTranslation } from '@/lib/constants/languages';

export interface SoulboundSvgPreviewProps {
  /** Language code (e.g., 'en', 'es', 'zh') */
  language: string;
  /** Type of soulbound token */
  type: 'wallet' | 'support';
  /** Custom width (default: 290) */
  width?: number;
  /** Custom height (default: 400) */
  height?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Animated SVG preview of a soulbound token.
 *
 * Shows the token artwork with:
 * - Rotating text around the border (registry URL)
 * - Language name and translation in the center
 *
 * @example
 * ```tsx
 * <SoulboundSvgPreview
 *   language="es"
 *   type="wallet"
 * />
 * ```
 */
export function SoulboundSvgPreview({
  language,
  type,
  width = 290,
  height = 400,
  className,
}: SoulboundSvgPreviewProps) {
  // Use static lookup for preview (actual NFT uses on-chain translations)
  const displayName = getLanguageName(language);
  const translation = getLanguageTranslation(language);
  const isEnglish = language === 'en';
  const isRtl = language === 'ar'; // Arabic requires RTL text direction

  // Animation duration for rotating text
  const animationDuration = '30s';

  // Border text for animation
  const borderText =
    type === 'wallet'
      ? 'stolenwalletregistry.xyz \u2022 stolenwalletregistry.eth \u2022 '
      : 'Support the Registry \u2022 stolenwalletregistry.xyz \u2022 ';

  return (
    <div className={cn('inline-block', className)}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 290 400"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        className="rounded-[40px]"
      >
        <defs>
          {/* Path for animated text around border */}
          <path
            id={`text-path-${type}`}
            d="M40 12 H250 A28 28 0 0 1 278 40 V360 A28 28 0 0 1 250 388 H40 A28 28 0 0 1 12 360 V40 A28 28 0 0 1 40 12 z"
          />
          {/* Gradient for header */}
          <linearGradient id={`header-gradient-${type}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={type === 'wallet' ? '#ef4444' : '#8b5cf6'} />
            <stop offset="100%" stopColor={type === 'wallet' ? '#dc2626' : '#6366f1'} />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect width="100%" height="100%" rx="40" fill="#1f2937" />

        {/* Inner border */}
        <rect
          x="16"
          y="16"
          width="258"
          height="368"
          rx="26"
          ry="26"
          fill="transparent"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
        />

        {/* Animated border text */}
        <text
          textRendering="optimizeSpeed"
          fill="#fff"
          fontFamily="system-ui, sans-serif"
          fontSize="10"
          opacity="0.7"
        >
          {/* First text instance */}
          <textPath startOffset="-100%" xlinkHref={`#text-path-${type}`} fontWeight="500">
            {borderText}
            <animate
              additive="sum"
              attributeName="startOffset"
              from="0%"
              to="100%"
              begin="0s"
              dur={animationDuration}
              repeatCount="indefinite"
            />
          </textPath>
          {/* Second text instance (offset for continuous loop) */}
          <textPath startOffset="0%" xlinkHref={`#text-path-${type}`} fontWeight="500">
            {borderText}
            <animate
              additive="sum"
              attributeName="startOffset"
              from="0%"
              to="100%"
              begin="0s"
              dur={animationDuration}
              repeatCount="indefinite"
            />
          </textPath>
        </text>

        {/* Token type header */}
        <rect
          x="60"
          y="50"
          width="170"
          height="32"
          rx="16"
          fill={`url(#header-gradient-${type})`}
        />
        <text
          x="145"
          y="71"
          textAnchor="middle"
          fill="#fff"
          fontFamily="system-ui, sans-serif"
          fontSize="14"
          fontWeight="600"
        >
          {type === 'wallet' ? 'STOLEN WALLET' : 'SUPPORTER'}
        </text>

        {/* Center icon/symbol */}
        <g transform="translate(115, 140)">
          <circle cx="30" cy="30" r="35" fill="rgba(255,255,255,0.1)" />
          {type === 'wallet' ? (
            // Wallet icon (simplified)
            <path
              d="M15 25 h30 a5 5 0 0 1 5 5 v15 a5 5 0 0 1 -5 5 h-30 a5 5 0 0 1 -5 -5 v-15 a5 5 0 0 1 5 -5 M20 25 v-5 a10 10 0 0 1 20 0 v5"
              fill="none"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            // Heart icon for support
            <path d="M30 50 C10 35 10 15 30 25 C50 15 50 35 30 50 Z" fill="rgba(255,255,255,0.8)" />
          )}
        </g>

        {/* Language display */}
        <g fill="#fff" fontFamily="system-ui, sans-serif">
          {/* Show "English" label if not English */}
          {!isEnglish && (
            <>
              <text x="30" y="250" fontSize="11" opacity="0.5">
                English
              </text>
              <text x="30" y="268" fontSize="12" opacity="0.7">
                This wallet has been marked as stolen.
              </text>
            </>
          )}

          {/* Language name */}
          <text
            x={isRtl ? 260 : 30}
            y={isEnglish ? 260 : 300}
            fontSize="11"
            opacity="0.5"
            textAnchor={isRtl ? 'end' : 'start'}
          >
            {displayName}
          </text>

          {/* Translation - RTL direction for Arabic */}
          <text
            x={isRtl ? 260 : 30}
            y={isEnglish ? 280 : 320}
            fontSize="12"
            fontWeight="500"
            textAnchor={isRtl ? 'end' : 'start'}
            style={isRtl ? { direction: 'rtl' } : undefined}
          >
            {/* Truncate if too long */}
            {translation.length > 45 ? `${translation.slice(0, 42)}...` : translation}
          </text>
        </g>

        {/* ERC-5192 badge */}
        <rect x="85" y="355" width="120" height="24" rx="12" fill="rgba(255,255,255,0.1)" />
        <text
          x="145"
          y="372"
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontFamily="system-ui, sans-serif"
          fontSize="10"
          fontWeight="500"
        >
          ERC-5192 SOULBOUND
        </text>
      </svg>
    </div>
  );
}

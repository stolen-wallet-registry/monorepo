/**
 * Soulbound SVG preview component.
 *
 * Renders an animated SVG preview that matches the on-chain SVGRenderer.sol exactly.
 * Uses 400x400 viewBox with single border path (text at 0% and 50% offset for opposite sides).
 */

import { cn } from '@/lib/utils';
import { getLanguageTranslation } from '@/lib/constants/languages';

// Domain shown in SVG (matches contract default)
const DOMAIN = 'stolenwallet.xyz';

export interface SoulboundSvgPreviewProps {
  /** Language code (e.g., 'en', 'es', 'zh') */
  language: string;
  /** Type of soulbound token */
  type: 'wallet' | 'support';
  /** Custom size (default: 400) - SVG is square */
  size?: number;
  /** Additional class names */
  className?: string;
}

/**
 * Animated SVG preview of a soulbound token.
 *
 * Matches SVGRenderer.sol output exactly:
 * - 400x400 square viewBox
 * - Single border path with two textPaths at 0% and 50% offset (opposite sides)
 * - Black background (#000) with white text (#fff)
 * - Full wallet address (no truncation)
 * - English subtitle hidden (redundant with border text)
 */
export function SoulboundSvgPreview({
  language,
  type,
  size = 400,
  className,
}: SoulboundSvgPreviewProps) {
  const translation = getLanguageTranslation(language, type);
  const isEnglish = language === 'en';

  // Match contract animation duration (60s)
  const animationDuration = '60s';

  // Content for border text (repeated 3x with single separator for coverage)
  const text1 = `${DOMAIN} - ${DOMAIN} - ${DOMAIN} - `;
  const text2 =
    type === 'wallet'
      ? 'STOLEN WALLET - STOLEN WALLET - STOLEN WALLET - '
      : 'THANK YOU - THANK YOU - THANK YOU - ';

  // Preview address (full 42-char format)
  const previewAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const previewTokenId = '42';
  const previewDonation = '0.01 ETH';

  return (
    <div className={cn('inline-block', className)}>
      <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Single rectangular path - centered in gutter at y=12 */}
          <path
            id="borderPath"
            d="M200 12 H368 A16 16 0 0 1 388 32 V368 A16 16 0 0 1 368 388 H32 A16 16 0 0 1 12 368 V32 A16 16 0 0 1 32 12 H200"
          />
        </defs>

        {/* Black background */}
        <rect width="400" height="400" fill="#000" />

        {/* Inner border with subtle gray stroke */}
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

        {/* First text at 0% offset, animates 0% -> 100% (clockwise) */}
        <text fill="#fff" fontSize="10" fontFamily="monospace">
          <textPath href="#borderPath">
            <animate
              attributeName="startOffset"
              from="0%"
              to="100%"
              dur={animationDuration}
              repeatCount="indefinite"
            />
            {text1}
          </textPath>
        </text>

        {/* Second text at 50% offset (opposite side), animates 50% -> 150% */}
        <text fill="#fff" fontSize="10" fontFamily="monospace">
          <textPath href="#borderPath" startOffset="50%">
            <animate
              attributeName="startOffset"
              from="50%"
              to="150%"
              dur={animationDuration}
              repeatCount="indefinite"
            />
            {text2}
          </textPath>
        </text>

        {/* Center content */}
        {type === 'wallet' ? (
          // Wallet token content
          <g fontFamily="monospace">
            {/* English title - ALWAYS shown */}
            <text x="200" y="120" textAnchor="middle" fill="#fff" fontSize="16">
              STOLEN WALLET
            </text>

            {/* Translation line - only show if NOT English (below English title) */}
            {!isEnglish && (
              <text x="200" y="150" textAnchor="middle" fill="#fff" fontSize="14">
                {translation}
              </text>
            )}

            {/* Full wallet address - white text, larger font */}
            <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="11">
              {previewAddress}
            </text>

            {/* Token ID - white text */}
            <text x="200" y="240" textAnchor="middle" fill="#fff" fontSize="12">
              WALLET #{previewTokenId}
            </text>

            {/* Footer - white text */}
            <text x="200" y="360" textAnchor="middle" fill="#fff" fontSize="10">
              Stolen Wallet Registry
            </text>
          </g>
        ) : (
          // Support token content
          <g fontFamily="monospace">
            {/* Title */}
            <text x="200" y="150" textAnchor="middle" fill="#fff" fontSize="16">
              SUPPORTER
            </text>

            {/* Donation amount */}
            <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="24">
              {previewDonation}
            </text>

            {/* Full supporter address - white text, larger font */}
            <text x="200" y="250" textAnchor="middle" fill="#fff" fontSize="11">
              {previewAddress}
            </text>

            {/* Token ID - white text */}
            <text x="200" y="280" textAnchor="middle" fill="#fff" fontSize="12">
              TOKEN #{previewTokenId}
            </text>

            {/* Footer - white text */}
            <text x="200" y="360" textAnchor="middle" fill="#fff" fontSize="10">
              Stolen Wallet Registry
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

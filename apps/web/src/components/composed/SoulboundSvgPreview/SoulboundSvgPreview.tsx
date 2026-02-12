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

// Preview data (static, for display purposes only)
const PREVIEW_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const PREVIEW_TOKEN_ID = '42';
const PREVIEW_DONATION = '0.01 ETH';

export interface SoulboundSvgPreviewProps {
  /** Language code (e.g., 'en', 'es', 'zh'). Defaults to 'en'. */
  language?: string;
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
  language = 'en',
  type,
  size = 400,
  className,
}: SoulboundSvgPreviewProps) {
  const translation = getLanguageTranslation(language, type);
  const isEnglish = language === 'en';

  // Match contract animation duration (60s)
  const animationDuration = '60s';

  // Content for border text (repeated 3x, NO trailing dash)
  const text1 = `${DOMAIN} - ${DOMAIN} - ${DOMAIN}`;
  const text2 =
    type === 'wallet'
      ? 'STOLEN WALLET - STOLEN WALLET - STOLEN WALLET'
      : 'THANK YOU - THANK YOU - THANK YOU';

  return (
    <div className={cn('inline-block', className)}>
      <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Single rectangular path - centered in gutter at y=12 */}
          {/* Path bounds: 12-388 (376px), corners at ±16px from edges for 16px radius arcs */}
          <path
            id="borderPath"
            d="M200 12 H372 A16 16 0 0 1 388 28 V372 A16 16 0 0 1 372 388 H28 A16 16 0 0 1 12 372 V28 A16 16 0 0 1 28 12 H200"
          />
        </defs>

        {/* Black background with rounded corners and white border for visibility */}
        <rect width="400" height="400" rx="20" fill="#000" stroke="#fff" strokeWidth="1" />

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
            <text x="200" y="110" textAnchor="middle" fill="#fff" fontSize="16">
              STOLEN WALLET
            </text>

            {/* English subtitle - ALWAYS shown (no lang attribute) */}
            <text x="200" y="135" textAnchor="middle" fill="#fff" fontSize="12">
              Signed as stolen
            </text>

            {/* Translation line - only show if NOT English (below English subtitle) */}
            {!isEnglish && (
              <text x="200" y="160" textAnchor="middle" fill="#fff" fontSize="14">
                {translation}
              </text>
            )}

            {/* Full wallet address - white text, larger font */}
            <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="11">
              {PREVIEW_ADDRESS}
            </text>

            {/* Token ID - white text */}
            <text x="200" y="240" textAnchor="middle" fill="#fff" fontSize="12">
              WALLET #{PREVIEW_TOKEN_ID}
            </text>

            {/* Domain - white text at y=320 */}
            <text x="200" y="320" textAnchor="middle" fill="#fff" fontSize="11">
              {DOMAIN}
            </text>

            {/* Footer - white text */}
            <text x="200" y="360" textAnchor="middle" fill="#fff" fontSize="10">
              Stolen Wallet Registry
            </text>
          </g>
        ) : (
          // Support token content
          <g fontFamily="monospace">
            {/* English title - ALWAYS shown */}
            <text x="200" y="110" textAnchor="middle" fill="#fff" fontSize="16">
              SUPPORTER
            </text>

            {/* English subtitle - ALWAYS shown (no lang attribute) */}
            <text x="200" y="135" textAnchor="middle" fill="#fff" fontSize="12">
              Thank you for your support
            </text>

            {/* Translation line - only show if NOT English */}
            {!isEnglish && (
              <text x="200" y="160" textAnchor="middle" fill="#fff" fontSize="14">
                {translation}
              </text>
            )}

            {/* Donation amount */}
            <text x="200" y="200" textAnchor="middle" fill="#fff" fontSize="24">
              {PREVIEW_DONATION}
            </text>

            {/* Full supporter address - white text, larger font */}
            <text x="200" y="250" textAnchor="middle" fill="#fff" fontSize="11">
              {PREVIEW_ADDRESS}
            </text>

            {/* Token ID - white text */}
            <text x="200" y="280" textAnchor="middle" fill="#fff" fontSize="12">
              TOKEN #{PREVIEW_TOKEN_ID}
            </text>

            {/* Domain - white text at y=320 */}
            <text x="200" y="320" textAnchor="middle" fill="#fff" fontSize="11">
              {DOMAIN}
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

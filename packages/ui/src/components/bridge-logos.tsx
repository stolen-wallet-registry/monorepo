/**
 * Bridge provider logos for cross-chain UI.
 *
 * These are official brand logos for cross-chain bridge protocols.
 */

import { cn } from '../lib/utils';

export interface BridgeLogoProps {
  className?: string;
  title?: string;
}

/**
 * Hyperlane Logo - official brand logo
 */
export function HyperlaneLogo({ className, title = 'Hyperlane' }: BridgeLogoProps) {
  const titleId = 'hyperlane-logo-title';
  return (
    <svg
      viewBox="0 0 1000 1000"
      className={cn('size-4', className)}
      fill="none"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      {/* Back chevrons (magenta) */}
      <path
        d="M495.652 253H596.119C609.826 253 622.089 260.959 626.874 272.961L715.058 494.148C715.739 495.854 715.747 497.731 715.081 499.443L714.587 500.714L714.582 500.726L626.769 726.524C622.054 738.646 609.726 746.716 595.923 746.716H495.471C489.822 746.716 485.862 741.506 487.724 736.523L578.271 494.148L487.946 263.299C485.989 258.297 489.952 253 495.652 253Z"
        fill="#D631B9"
      />
      <path
        d="M233.393 253H333.86C347.567 253 359.83 260.959 364.614 272.961L452.799 494.148C453.479 495.854 453.487 497.731 452.822 499.443L452.327 500.714L452.322 500.726L364.509 726.524C359.795 738.646 347.467 746.716 333.664 746.716H233.212C227.563 746.716 223.603 741.506 225.465 736.523L316.012 494.148L225.687 263.299C223.73 258.297 227.693 253 233.393 253Z"
        fill="#D631B9"
      />
      <path d="M563.826 447H422V554H563.826L587 498.971L563.826 447Z" fill="#D631B9" />
      {/* Front chevrons (theme-aware) */}
      <path
        d="M553.652 253H654.119C667.826 253 680.089 260.959 684.874 272.961L773.058 494.148C773.739 495.854 773.747 497.731 773.081 499.443L772.587 500.714L772.582 500.726L684.769 726.524C680.054 738.646 667.726 746.716 653.923 746.716H553.471C547.822 746.716 543.862 741.506 545.724 736.523L636.271 494.148L545.946 263.299C543.989 258.297 547.952 253 553.652 253Z"
        className="fill-black dark:fill-white"
      />
      <path
        d="M291.393 253H391.86C405.567 253 417.83 260.959 422.614 272.961L510.799 494.148C511.479 495.854 511.487 497.731 510.822 499.443L510.327 500.714L510.322 500.726L422.509 726.524C417.795 738.646 405.467 746.716 391.664 746.716H291.212C285.563 746.716 281.603 741.506 283.465 736.523L374.012 494.148L283.687 263.299C281.73 258.297 285.693 253 291.393 253Z"
        className="fill-black dark:fill-white"
      />
      <path
        d="M621.826 447H480V554H621.826L645 498.971L621.826 447Z"
        className="fill-black dark:fill-white"
      />
    </svg>
  );
}

/**
 * Wormhole Logo - official brand logo
 */
export function WormholeLogo({ className, title = 'Wormhole' }: BridgeLogoProps) {
  const titleId = 'wormhole-logo-title';
  return (
    <svg
      viewBox="0 0 255.4235 255.4555"
      className={cn('size-4', className)}
      fill="currentColor"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      <path d="m197.9535,174.6565c-7.318,12.735-20.858,20.566-35.532,20.566h-23.731v-80.03l-34.251,59.483c-7.3188,12.734-20.8583,20.565-35.5323,20.565h-23.5661v-118.1051h47.4067v79.8281l45.9427-79.7915v-.0366h47.389v80.1581l49.785-86.5071c2.013-3.513,1.976-7.8676-.201-11.2891C212.7015,23.2333,171.9905-.6805,125.7365.0148,55.203,1.1126-.3641,57.8872.0018,128.4215c.3659,70.222,57.4151,127.034,127.7107,127.034s127.711-57.178,127.711-127.711c0-11.363-1.5-22.377-4.299-32.8796-.842-3.1836-5.087-3.7691-6.734-.9331l-46.455,80.7067.018.018Z" />
    </svg>
  );
}

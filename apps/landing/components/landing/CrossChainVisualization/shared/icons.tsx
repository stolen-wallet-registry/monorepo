'use client';

import React, { forwardRef } from 'react';
import { motion } from 'motion/react';
import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';

import { BEAM_DURATION } from './constants';

// Icon with tooltip wrapper - accessibility improved
export const IconCircle = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children: React.ReactNode;
    label: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    pulse?: boolean;
    pulseDelay?: number;
  }
>(({ className, children, label, size = 'md', pulse = false, pulseDelay = 0 }, ref) => {
  const sizeClasses = {
    xs: 'size-8 p-1',
    sm: 'size-10 p-1.5',
    md: 'size-12 p-2',
    lg: 'size-14 p-2.5',
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          ref={ref}
          className={cn(
            'relative z-10 flex cursor-pointer items-center justify-center rounded-full border-2 border-border bg-background shadow-md transition-transform hover:scale-110',
            sizeClasses[size],
            className
          )}
          aria-label={label}
          role="img"
          animate={
            pulse
              ? {
                  boxShadow: [
                    '0 0 0 0 rgba(34, 197, 94, 0)',
                    '0 0 0 8px rgba(34, 197, 94, 0.3)',
                    '0 0 0 0 rgba(34, 197, 94, 0)',
                  ],
                }
              : {}
          }
          transition={
            pulse
              ? {
                  duration: 1.5,
                  repeat: Infinity,
                  delay: pulseDelay,
                  repeatDelay: BEAM_DURATION - 1.5,
                }
              : {}
          }
        >
          {children}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
});
IconCircle.displayName = 'IconCircle';

// Bridge icon (smaller, subtle) - accessibility improved
export const BridgeIcon = forwardRef<
  HTMLDivElement,
  { className?: string; children: React.ReactNode; label: string }
>(({ className, children, label }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div
        ref={ref}
        className={cn(
          'z-10 flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background p-1.5 shadow-sm transition-transform hover:scale-110',
          className
        )}
        aria-label={label}
        role="img"
      >
        {children}
      </div>
    </TooltipTrigger>
    <TooltipContent>
      <p>{label}</p>
    </TooltipContent>
  </Tooltip>
));
BridgeIcon.displayName = 'BridgeIcon';

// Chainalysis Logo - official brand icon
export function ChainalysisLogo({
  className,
  title = 'Chainalysis',
}: {
  className?: string;
  title?: string;
}) {
  const titleId = 'chainalysis-logo-title';
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('size-5', className)}
      fill="currentColor"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      {/* Official Chainalysis brand icon */}
      <path d="M50 0c1.12 0 2.39.14 2.39.14a28.31 28.31 0 00-6.48 15.92 33.76 33.76 0 00-27.86 28.59c-6.47.7-13.79 3.66-18 7.89C-.95 23.52 21.29 0 50 0zm7.2 87.18a27 27 0 01-4 .29 49.17 49.17 0 01-6.9-.57 51.83 51.83 0 01-7 12A50 50 0 011.72 62.82c4.51-5.35 14.93-8.45 21.4-8.45 13.8 0 21.12 7.32 23.66 18.73-8.31-2.25-13.24-6.9-16.48-13.8a16.68 16.68 0 00-5.91-1 16.83 16.83 0 00-5.35.85C22.7 73.1 36.22 83.52 52.69 83.52c15.21 0 21.68-7.74 21.68-7.74V63.94s-7.46 7.75-16.75 9.3A33.74 33.74 0 0028.9 44.65C31.29 32.82 40.3 26.2 52.55 26.2s22.11 8.87 22.11 8.87V23.38s-6.34-5.92-17.6-7.18c.28-5.2 3.66-11.69 7.32-14.09C79.72 6.9 94.51 19.86 98.73 38.73c0 0-6.76 6.76-19.43 6.76-10.42 0-17-5.21-20.7-14.36a17.28 17.28 0 00-6.05-1 15.4 15.4 0 00-5.63 1c4.08 14.65 17 24.5 31.4 24.5 14.08 0 21.68-6.47 21.68-6.47 0 29.29-22.39 50.28-49 50.84 3.1-3 5.49-9.58 6.2-12.82z" />
    </svg>
  );
}

// SEAL Team (Security Alliance) Logo - official brand icon
export function SealTeamLogo({
  className,
  title = 'SEAL Team (Security Alliance)',
}: {
  className?: string;
  title?: string;
}) {
  const titleId = 'seal-team-logo-title';
  return (
    <svg
      viewBox="226 285 895 755"
      className={cn('size-5', className)}
      fill="currentColor"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      {/* Security Alliance geometric logo */}
      <path d="M237.78 911.726L524.57 1030.45L575.224 836.774L343.25 755.274L237.78 911.726Z" />
      <path d="M365.662 723.202L435.875 618.031L712.774 666.239L719.545 694.077L721.319 701.37L741.528 784.452L484.868 742.627L365.662 723.202Z" />
      <path d="M463.956 570.731L609.886 618.804L618.816 583.082L620.813 575.096L631.488 532.395L511.76 499.323L463.956 570.731Z" />
      <path d="M533.568 472.734L637.33 495.007L658.868 499.63L657.79 493.081L655.359 478.305L649.184 440.782L562.849 428.515L533.568 472.734Z" />
      <path d="M586.757 400.448L629.482 410.586L650.551 299.14L586.757 400.448Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M650.613 285.025L725.615 406.458L645.342 416.187L629.056 418.161L626.259 417.498L574.871 405.305L650.613 285.025ZM598.642 395.591L623.596 401.512L635.901 336.423L598.642 395.591ZM654.314 319.447L638.718 401.942L700.632 394.438L654.314 319.447Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M999.67 783.957L1107.77 960.687L524.57 1030.45L575.224 836.774L999.67 783.957ZM534.571 1021.73L1095.32 954.653L995.812 791.964L581.169 843.562L534.571 1021.73Z"
      />
      <path d="M612.588 497.336L658.768 507.248L694.257 500.598L677.351 496.166L658.868 499.63L637.33 495.007L612.588 497.336Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M730.937 427.265L640.398 407.46L558.398 421.707L521.295 477.74L563.991 486.904L507.528 492.219L452.277 574.749L544.03 604.974L609.151 626.426L743.631 609.401L846.477 596.381L791.964 510.767L728.613 494.16L768.329 486.718L730.937 427.265ZM613.476 482.247L647.904 479.007L642.704 447.406L566.471 436.574L545.841 467.729L613.476 482.247ZM552.943 502.949L612.588 497.336L637.33 495.007L658.868 499.63L677.351 496.166L694.257 500.598L744.867 513.865L632.143 524.826L552.943 502.949ZM645.342 416.187L726.282 433.893L649.184 440.782L562.849 428.515L626.259 417.498L629.056 418.161L645.342 416.187ZM677.623 488.516L664.998 490.882L664.029 484.992L662.813 477.603L657.86 447.506L722.393 441.74L743.99 476.08L694.801 485.297L677.623 488.516ZM514.968 507.958L622.474 537.654L604.589 609.195L475.634 566.714L514.968 507.958ZM619.78 610.022L692.823 600.775L718.386 597.539L743.95 594.302L821.215 584.521L783.397 525.128L637.456 539.319L628.606 574.72L626.789 581.988L624.905 589.523L619.78 610.022Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M713.124 400.448L629.482 410.586L650.551 299.14L713.124 400.448ZM654.314 319.447L638.718 401.942L700.632 394.438L654.314 319.447Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M787.236 517.249L833.846 590.451L769.354 598.615L884.079 618.093L953.898 727.475L905.98 742.093L1004.68 777.825L1120.22 966.721L523.518 1038.1L226.477 915.131L338.911 748.347L410.709 738.11L353.005 728.707L431.4 611.281L620.813 575.096L631.488 532.395L787.236 517.249ZM712.116 695.137L460.249 731.047L378.319 717.696L439.387 626.224L706.673 672.759L712.116 695.137ZM460.098 746.159L374.555 758.355L576.043 829.145L967.868 780.387L882.163 749.359L870.457 745.121L741.528 784.452L484.868 742.627L460.098 746.159ZM477.466 617.69L712.505 658.61L842.995 626.271L743.631 609.401L609.151 626.426L544.03 604.974L477.466 617.69ZM692.823 600.775L619.78 610.022L624.905 589.523L626.789 581.988L628.606 574.72L637.456 539.319L783.397 525.128L821.215 584.521L743.95 594.302L718.386 597.539L692.823 600.775ZM876.154 633.443L721.79 671.7L726.975 693.018L728.749 700.31L730.523 707.602L746.916 774.999L858.751 740.882L870.659 737.25L882.567 733.617L930.719 718.928L876.154 633.443ZM566.256 841.541L346.218 764.234L249.084 908.322L519.511 1020.27L566.256 841.541ZM1095.32 954.653L534.571 1021.73L581.169 843.562L995.812 791.964L1095.32 954.653Z"
      />
      <path d="M460.098 746.159L742.043 792.104L882.163 749.359L870.457 745.121L741.528 784.452L484.868 742.627L460.098 746.159Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M649.184 440.782L726.282 433.893L645.342 416.187L629.056 418.161L626.259 417.498L562.849 428.515L649.184 440.782ZM649.38 433.265L677.125 430.786L640.068 422.68L610.741 427.775L649.38 433.265Z"
      />
    </svg>
  );
}

// Hyperlane Logo - official brand logo from Hyperlane
export function HyperlaneLogo({
  className,
  title = 'Hyperlane',
}: {
  className?: string;
  title?: string;
}) {
  const titleId = 'hyperlane-logo-title';
  return (
    <svg
      viewBox="0 0 1000 1000"
      className={cn('size-5', className)}
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
      {/* Front chevrons (theme-aware: black in light, white in dark) */}
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

// Wormhole Logo - official brand logo
export function WormholeLogo({
  className,
  title = 'Wormhole',
}: {
  className?: string;
  title?: string;
}) {
  const titleId = 'wormhole-logo-title';
  return (
    <svg
      viewBox="0 0 255.4235 255.4555"
      className={cn('size-5', className)}
      fill="currentColor"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      <path d="m197.9535,174.6565c-7.318,12.735-20.858,20.566-35.532,20.566h-23.731v-80.03l-34.251,59.483c-7.3188,12.734-20.8583,20.565-35.5323,20.565h-23.5661v-118.1051h47.4067v79.8281l45.9427-79.7915v-.0366h47.389v80.1581l49.785-86.5071c2.013-3.513,1.976-7.8676-.201-11.2891C212.7015,23.2333,171.9905-.6805,125.7365.0148,55.203,1.1126-.3641,57.8872.0018,128.4215c.3659,70.222,57.4151,127.034,127.7107,127.034s127.711-57.178,127.711-127.711c0-11.363-1.5-22.377-4.299-32.8796-.842-3.1836-5.087-3.7691-6.734-.9331l-46.455,80.7067.018.018Z" />
    </svg>
  );
}

'use client';

import { type RefObject, useEffect, useId, useState, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '../lib/utils';

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  /** Delay between animation cycles (default: 0) */
  repeatDelay?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
  /** Controls if beam is visible and animating. When false, beam is hidden. (default: true) */
  isActive?: boolean;
  /** @deprecated - Timing should be managed externally. This prop is preserved for backwards compatibility. */
  onComplete?: () => void;
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration: durationProp,
  delay = 0,
  repeatDelay = 0,
  pathColor = 'gray',
  pathWidth = 2,
  pathOpacity = 0.4,
  gradientStartColor = '#ffaa40',
  gradientStopColor = '#9c40ff',
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
  isActive = true,
  onComplete: _onComplete,
}) => {
  // Note: _onComplete is preserved for backwards compatibility but timing should be managed externally
  const id = useId();

  // Respect user's reduced motion preference for accessibility
  const shouldReduceMotion = useReducedMotion();
  // Memoize random duration to prevent animation resets on parent re-renders
  const [stableDuration] = useState(() => durationProp ?? Math.random() * 3 + 4);
  const duration = durationProp ?? stableDuration;
  const [pathD, setPathD] = useState('');
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });

  // Track animation cycles - increment counter when isActive transitions false→true
  // Using state instead of ref to trigger proper re-render with new key
  const [activationCount, setActivationCount] = useState(0);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActivationCount((c) => c + 1);
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  // Gradient travels exactly 100% (the visible path length) over the duration
  // This ensures beam exits exactly when timer fires for next step
  // x1 = tail (trailing edge), x2 = head (leading edge), gradient width = 10%
  const gradientCoordinates = reverse
    ? {
        x1: ['100%', '0%'], // tail: end → start
        x2: ['110%', '10%'], // head: 10% ahead of tail
        y1: ['0%', '0%'],
        y2: ['0%', '0%'],
      }
    : {
        x1: ['0%', '100%'], // tail: start → end
        x2: ['10%', '110%'], // head: 10% ahead of tail
        y1: ['0%', '0%'],
        y2: ['0%', '0%'],
      };

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rectA = fromRef.current.getBoundingClientRect();
        const rectB = toRef.current.getBoundingClientRect();

        const svgWidth = containerRect.width;
        const svgHeight = containerRect.height;
        setSvgDimensions({ width: svgWidth, height: svgHeight });

        const startX = rectA.left - containerRect.left + rectA.width / 2 + startXOffset;
        const startY = rectA.top - containerRect.top + rectA.height / 2 + startYOffset;
        const endX = rectB.left - containerRect.left + rectB.width / 2 + endXOffset;
        const endY = rectB.top - containerRect.top + rectB.height / 2 + endYOffset;

        const controlY = startY - curvature;
        const d = `M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`;
        setPathD(d);
      }
    };

    // Initialize ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      updatePath();
    });

    // Observe the container element
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Call the updatePath initially to set the initial path
    updatePath();

    // Clean up the observer on component unmount
    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, fromRef, toRef, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn('pointer-events-none absolute top-0 left-0 transform-gpu stroke-2', className)}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
      aria-hidden="true"
    >
      {/* Static path (track) - always visible */}
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      {/* Animated gradient path - only visible when active */}
      {isActive && (
        <path
          d={pathD}
          strokeWidth={pathWidth}
          stroke={`url(#${id})`}
          strokeOpacity="1"
          strokeLinecap="round"
        />
      )}
      <defs>
        {shouldReduceMotion ? (
          // Static gradient for users who prefer reduced motion
          // Matches animated gradient's appearance: respects reverse prop, uses 4-stop fade pattern
          <linearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            x1={reverse ? '90%' : '10%'}
            y1="0%"
            x2={reverse ? '100%' : '0%'}
            y2="0%"
          >
            <stop stopColor={gradientStartColor} stopOpacity="0" />
            <stop stopColor={gradientStartColor} />
            <stop offset="32.5%" stopColor={gradientStopColor} />
            <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
          </linearGradient>
        ) : (
          <motion.linearGradient
            key={activationCount}
            className="transform-gpu"
            id={id}
            gradientUnits={'userSpaceOnUse'}
            initial={{
              // Match first keyframe position so animation starts immediately visible
              x1: reverse ? '100%' : '0%',
              x2: reverse ? '110%' : '10%',
              y1: '0%',
              y2: '0%',
            }}
            animate={
              isActive
                ? {
                    x1: gradientCoordinates.x1,
                    x2: gradientCoordinates.x2,
                    y1: gradientCoordinates.y1,
                    y2: gradientCoordinates.y2,
                  }
                : undefined
            }
            transition={{
              delay,
              duration,
              // Linear easing - beam moves at constant speed, immediately visible
              ease: 'linear',
              // Animation plays once per activation cycle. Parent manages timing externally.
              repeat: 0,
              repeatDelay,
            }}
          >
            <stop stopColor={gradientStartColor} stopOpacity="0"></stop>
            <stop stopColor={gradientStartColor}></stop>
            <stop offset="32.5%" stopColor={gradientStopColor}></stop>
            <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0"></stop>
          </motion.linearGradient>
        )}
      </defs>
    </svg>
  );
};

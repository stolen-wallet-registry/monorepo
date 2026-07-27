'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type MotionProps } from 'motion/react';

import { cn } from '../lib/utils';

type CharacterSet = string[] | readonly string[];

interface HyperTextProps extends MotionProps {
  /** The text content to be animated */
  children: string;
  /** Optional className for styling */
  className?: string;
  /** Duration of the animation in milliseconds */
  duration?: number;
  /** Delay before animation starts in milliseconds */
  delay?: number;
  /** Component to render as - defaults to div */
  as?: React.ElementType;
  /** Whether to start animation when element comes into view */
  startOnView?: boolean;
  /** Whether to trigger animation on hover */
  animateOnHover?: boolean;
  /** Custom character set for scramble effect. Defaults to uppercase alphabet */
  characterSet?: CharacterSet;
}

const DEFAULT_CHARACTER_SET = Object.freeze(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
) as readonly string[];

const getRandomInt = (max: number): number => Math.floor(Math.random() * max);

export function HyperText({
  children,
  className,
  duration = 800,
  delay = 0,
  as: Component = 'div',
  startOnView = false,
  animateOnHover = true,
  characterSet = DEFAULT_CHARACTER_SET,
  ...props
}: HyperTextProps) {
  const MotionComponent = useMemo(
    () => motion.create(Component, { forwardMotionProps: true }),
    [Component]
  );

  const [displayText, setDisplayText] = useState<string[]>(() => children.split(''));
  const [isAnimating, setIsAnimating] = useState(false);
  const iterationCount = useRef(0);
  const elementRef = useRef<HTMLElement>(null);

  // Reset displayText when children changes (synchronize on render, not in effect).
  // The previous value is tracked in state rather than a ref: adjusting state during
  // render is the documented React pattern, but *writing a ref* during render is not —
  // a render React discards would still have mutated it, desynchronising the comparison.
  // See https://react.dev/learn/you-might-not-need-an-effect
  const [prevChildren, setPrevChildren] = useState(children);
  if (prevChildren !== children) {
    setPrevChildren(children);
    setDisplayText(children.split(''));
    // iterationCount is not reset here: the scramble effect recomputes it from elapsed
    // progress on every frame before reading it, and handleAnimationTrigger zeroes it
    // before starting. Resetting during render would be another render-phase mutation
    // for no behavioural gain.
  }

  const handleAnimationTrigger = () => {
    if (animateOnHover && !isAnimating) {
      iterationCount.current = 0;
      setIsAnimating(true);
    }
  };

  // Handle animation start based on view or delay
  useEffect(() => {
    if (!startOnView) {
      const startTimeout = setTimeout(() => {
        setIsAnimating(true);
      }, delay);
      return () => clearTimeout(startTimeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            setIsAnimating(true);
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '-30% 0px -30% 0px' }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [delay, startOnView]);

  // Handle scramble animation
  useEffect(() => {
    if (!isAnimating) return;

    const maxIterations = children.length;
    const startTime = performance.now();
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      iterationCount.current = progress * maxIterations;

      setDisplayText((currentText) =>
        currentText.map((letter, index) =>
          letter === ' '
            ? letter
            : index <= iterationCount.current
              ? children[index]
              : characterSet[getRandomInt(characterSet.length)]
        )
      );

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [children, duration, isAnimating, characterSet]);

  return (
    // MotionComponent is memoized on `Component`, so it is stable for the lifetime of any
    // given `as` prop. Changing `as` changes the rendered element type, which remounts and
    // resets state regardless of how the motion wrapper is built — the memo is as stable as
    // this can be made.
    // eslint-disable-next-line react-hooks/static-components
    <MotionComponent
      ref={elementRef}
      className={cn('overflow-hidden py-2 text-4xl font-bold', className)}
      onMouseEnter={handleAnimationTrigger}
      {...props}
    >
      <AnimatePresence>
        {/* Index is the correct key here: displayText is a fixed-length character array
            mutated in place every animation frame, and characters repeat. Keying by the
            letter would collide on duplicates and remount every span each frame, which
            destroys the scramble animation. */}
        {/* react-doctor-disable-next-line react-doctor/no-array-index-as-key */}
        {displayText.map((letter, index) => (
          <motion.span key={index} className={cn('font-mono', letter === ' ' ? 'w-3' : '')}>
            {letter.toUpperCase()}
          </motion.span>
        ))}
      </AnimatePresence>
    </MotionComponent>
  );
}

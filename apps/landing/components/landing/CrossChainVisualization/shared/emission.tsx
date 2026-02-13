'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@swr/ui';

import {
  BEAM_DURATION,
  CAIP_EXAMPLES,
  EMIT_DELAY,
  getChainConfig,
  truncateCaip,
  type EmissionType,
} from './constants';

export interface Emission {
  id: number;
  value: string;
  type: EmissionType;
  isWildcard?: boolean;
}

export interface Caip10EmissionProps {
  /** Event-driven emission trigger. When transitions to true, adds one emission. */
  triggerEmission?: boolean;
  /** Batch emission trigger. When transitions to true, adds MAX_EMISSIONS at once with stagger. */
  triggerBatchEmission?: boolean;
}

export const MAX_EMISSIONS = 3;
export const EMISSION_LIFETIME = 4000; // Auto-remove after 4 seconds

const BATCH_STAGGER_MS = 150; // Delay between each emission in a batch

// CAIP Emission Animation Component - stacking emissions with limit
export function Caip10Emission({ triggerEmission, triggerBatchEmission }: Caip10EmissionProps) {
  const [emissions, setEmissions] = useState<Emission[]>([]);
  const emissionCounter = useRef(0);
  const prevTriggerRef = useRef(triggerEmission);
  const prevBatchTriggerRef = useRef(triggerBatchEmission);
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const isControlled = triggerEmission !== undefined || triggerBatchEmission !== undefined;

  // Cleanup all pending timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.clear();
    };
  }, []);

  const addEmission = useCallback(() => {
    const id = emissionCounter.current++;
    const example = CAIP_EXAMPLES[id % CAIP_EXAMPLES.length];
    const isWildcard = example.type === 'address' && example.value.includes(':_:');
    const newEmission: Emission = { id, value: example.value, type: example.type, isWildcard };

    setEmissions((prev) => {
      const updated = [newEmission, ...prev];
      return updated.slice(0, MAX_EMISSIONS);
    });

    // Auto-remove this emission after lifetime
    const timeoutId = setTimeout(() => {
      setEmissions((prev) => prev.filter((e) => e.id !== id));
      timeoutsRef.current.delete(timeoutId);
    }, EMISSION_LIFETIME);
    timeoutsRef.current.add(timeoutId);
  }, []);

  // Batch: add MAX_EMISSIONS with staggered timing (operator batch submission)
  const addBatchEmission = useCallback(() => {
    for (let i = 0; i < MAX_EMISSIONS; i++) {
      const timeoutId = setTimeout(() => {
        addEmission();
        timeoutsRef.current.delete(timeoutId);
      }, i * BATCH_STAGGER_MS);
      timeoutsRef.current.add(timeoutId);
    }
  }, [addEmission]);

  // Handle single emission trigger
  useEffect(() => {
    if (isControlled && triggerEmission && !prevTriggerRef.current) {
      addEmission();
    }
    prevTriggerRef.current = triggerEmission;
  }, [triggerEmission, isControlled, addEmission]);

  // Handle batch emission trigger
  useEffect(() => {
    if (isControlled && triggerBatchEmission && !prevBatchTriggerRef.current) {
      addBatchEmission();
    }
    prevBatchTriggerRef.current = triggerBatchEmission;
  }, [triggerBatchEmission, isControlled, addBatchEmission]);

  // Original timing-based behavior (only when not controlled)
  useEffect(() => {
    if (isControlled) return;

    let interval: ReturnType<typeof setInterval>;

    // Start after beam hits registry, then start interval
    const initialTimeout = setTimeout(() => {
      addEmission();
      // Start interval after first emission
      interval = setInterval(addEmission, BEAM_DURATION * 1000);
    }, EMIT_DELAY * 1000);

    return () => {
      clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [isControlled, addEmission]);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2"
      aria-hidden="true"
    >
      <AnimatePresence mode="popLayout">
        {/* Render oldest first so newest appears at bottom (closer to hub) */}
        {[...emissions].reverse().map((emission) => {
          const chainConfig = getChainConfig(emission.value);
          return (
            <motion.div
              key={emission.id}
              layout
              initial={{ opacity: 0, y: 30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.8 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="whitespace-nowrap text-center"
            >
              <span
                className={cn(
                  'inline-flex w-[260px] items-center justify-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs shadow-sm',
                  chainConfig.bg,
                  chainConfig.text
                )}
              >
                <span className="text-sm">{chainConfig.icon}</span>
                <span>{truncateCaip(emission.value)}</span>
                {emission.type === 'transaction' && (
                  <span className="text-[10px] opacity-70">(tx)</span>
                )}
                {emission.type === 'contract' && (
                  <span className="text-[10px] opacity-70">(contract)</span>
                )}
                {emission.isWildcard && <span className="text-[10px] opacity-70">(all EVM)</span>}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

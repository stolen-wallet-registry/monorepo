'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@swr/ui';

import {
  BEAM_DURATION,
  CAIP_EXAMPLES,
  EMIT_DELAY,
  getChainConfig,
  truncateCaip,
} from './constants';

// CAIP Emission Animation Component - single emission at a time, readable pace
export function Caip10Emission() {
  const [currentEmission, setCurrentEmission] = useState<{
    id: number;
    value: string;
    type: 'address' | 'transaction';
  } | null>(null);
  const emissionCounter = useRef(0);

  useEffect(() => {
    const emitItem = () => {
      const id = emissionCounter.current++;
      const example = CAIP_EXAMPLES[id % CAIP_EXAMPLES.length];
      setCurrentEmission({ id, value: example.value, type: example.type });
    };

    // Start after beam hits registry
    const initialTimeout = setTimeout(emitItem, EMIT_DELAY * 1000);

    // Emit new one every beam cycle (3 seconds)
    const interval = setInterval(emitItem, BEAM_DURATION * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  const chainConfig = currentEmission ? getChainConfig(currentEmission.value) : null;

  return (
    <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2">
      <AnimatePresence mode="wait">
        {currentEmission && chainConfig && (
          <motion.div
            key={currentEmission.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="whitespace-nowrap text-center"
          >
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-xs shadow-sm',
                chainConfig.bg,
                chainConfig.text
              )}
            >
              <span className="text-sm">{chainConfig.icon}</span>
              <span>{truncateCaip(currentEmission.value)}</span>
              {currentEmission.type === 'transaction' && (
                <span className="text-[10px] opacity-70">(tx)</span>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

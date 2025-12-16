import type { Meta, StoryObj } from '@storybook/react';
import { useState, useEffect, useCallback } from 'react';
import { GracePeriodTimer } from './GracePeriodTimer';
import { Button } from '@swr/ui';
import { formatTimeRemaining } from '@/lib/blocks';

const meta: Meta<typeof GracePeriodTimer> = {
  title: 'Composed/GracePeriodTimer',
  component: GracePeriodTimer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    // Disable controls for BigInt props - Storybook can't serialize them
    blocksLeft: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GracePeriodTimer>;

/**
 * Interactive countdown timer wrapper.
 */
function LiveCountdown({ initialSeconds = 30 }: { initialSeconds?: number }) {
  const initialMs = initialSeconds * 1000;
  const [totalMs, setTotalMs] = useState(initialMs);
  const [isRunning, setIsRunning] = useState(true);

  const reset = useCallback(() => {
    setTotalMs(initialMs);
    setIsRunning(true);
  }, [initialMs]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (totalMs > 0) {
      setIsRunning(true);
    }
  }, [totalMs]);

  useEffect(() => {
    if (!isRunning || totalMs <= 0) return;

    const interval = setInterval(() => {
      setTotalMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          setIsRunning(false);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- totalMs checked in early return, functional updater handles state
  }, [isRunning]);

  const timeRemaining = formatTimeRemaining(totalMs);
  const isExpired = totalMs <= 0;
  // Simulate blocks (1 block per 12 seconds)
  const blocksLeft = BigInt(Math.ceil(totalMs / 12000));

  return (
    <div className="space-y-6">
      <GracePeriodTimer
        timeRemaining={timeRemaining}
        totalMs={totalMs}
        blocksLeft={blocksLeft}
        isExpired={isExpired}
        isRunning={isRunning}
        initialTotalMs={initialMs}
      />
      <div className="flex gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={reset}>
          Reset
        </Button>
        {isRunning ? (
          <Button variant="outline" size="sm" onClick={pause}>
            Pause
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={resume} disabled={isExpired}>
            Resume
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Longer countdown (2 minutes) to see different states including urgent mode.
 */
export const LiveCountdownLong: Story = {
  render: () => <LiveCountdown initialSeconds={120} />,
};

/**
 * Live countdown with controls - watch it count down in real-time!
 */
export const LiveCountdownDemo: Story = {
  render: () => <LiveCountdown initialSeconds={30} />,
};

/**
 * Default running timer with plenty of time remaining.
 */
export const Default: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 3,
      seconds: 42,
      totalSeconds: 222,
    },
    totalMs: 222_000, // 3:42
    blocksLeft: 19n,
    isExpired: false,
    isRunning: true,
    initialTotalMs: 300_000, // 5 minutes total
  },
};

/**
 * Timer with hours remaining (longer grace period).
 */
export const WithHours: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 1,
      minutes: 23,
      seconds: 45,
      totalSeconds: 5025,
    },
    totalMs: 5_025_000, // 1:23:45
    blocksLeft: 419n,
    isExpired: false,
    isRunning: true,
    initialTotalMs: 7_200_000, // 2 hours total
  },
};

/**
 * Timer in urgent state (less than 1 minute remaining).
 * Shows amber color and pulse animation.
 */
export const AlmostExpired: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 23,
      totalSeconds: 23,
    },
    totalMs: 23_000, // 23 seconds
    blocksLeft: 2n,
    isExpired: false,
    isRunning: true,
    initialTotalMs: 300_000,
  },
};

/**
 * Timer has expired and registration can proceed.
 */
export const Expired: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
    },
    totalMs: 0,
    blocksLeft: 0n,
    isExpired: true,
    isRunning: false,
    initialTotalMs: 300_000,
  },
};

/**
 * Loading state while fetching block data.
 */
export const Loading: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
    },
    totalMs: 0,
    blocksLeft: 0n,
    isExpired: false,
    isRunning: false,
    isLoading: true,
  },
};

/**
 * Paused timer (not running but not expired).
 */
export const Paused: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 2,
      seconds: 15,
      totalSeconds: 135,
    },
    totalMs: 135_000,
    blocksLeft: 11n,
    isExpired: false,
    isRunning: false,
    initialTotalMs: 300_000,
  },
};

/**
 * Single block remaining.
 */
export const SingleBlock: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 12,
      totalSeconds: 12,
    },
    totalMs: 12_000,
    blocksLeft: 1n,
    isExpired: false,
    isRunning: true,
    initialTotalMs: 300_000,
  },
};

/**
 * Waiting for block confirmation state.
 * Timer estimate hit 0 but blockchain hasn't confirmed target block yet.
 */
export const WaitingForBlock: Story = {
  args: {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
    },
    totalMs: 0,
    blocksLeft: 2n, // Still 2 blocks remaining on chain
    isExpired: false,
    isRunning: false,
    isWaitingForBlock: true,
    initialTotalMs: 300_000,
  },
};

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GracePeriodTimer } from './GracePeriodTimer';
import { getGracePeriodStatus } from './status';

describe('GracePeriodTimer', () => {
  const defaultProps = {
    timeRemaining: {
      days: 0,
      hours: 0,
      minutes: 3,
      seconds: 42,
      totalSeconds: 222,
    },
    totalMs: 222_000,
    blocksLeft: 19n,
    status: 'running' as const,
    initialTotalMs: 300_000,
  };

  describe('rendering', () => {
    it('renders time display', () => {
      render(<GracePeriodTimer {...defaultProps} />);
      expect(screen.getByText('03:42')).toBeInTheDocument();
    });

    it('renders blocks remaining', () => {
      render(<GracePeriodTimer {...defaultProps} />);
      expect(screen.getByText(/~19 blocks remaining/)).toBeInTheDocument();
    });

    it('renders singular block text for 1 block', () => {
      render(<GracePeriodTimer {...defaultProps} blocksLeft={1n} />);
      expect(screen.getByText(/~1 block remaining/)).toBeInTheDocument();
    });

    it('renders running status message', () => {
      render(<GracePeriodTimer {...defaultProps} />);
      expect(screen.getByText(/Please wait during the grace period/)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('renders skeletons when loading', () => {
      render(<GracePeriodTimer {...defaultProps} status="loading" />);

      // Should not show time or blocks
      expect(screen.queryByText('03:42')).not.toBeInTheDocument();
      expect(screen.queryByText(/blocks remaining/)).not.toBeInTheDocument();
    });
  });

  describe('expired state', () => {
    it('shows ready message when expired', () => {
      render(<GracePeriodTimer {...defaultProps} totalMs={0} blocksLeft={0n} status="expired" />);

      expect(screen.getByText('Ready to Continue')).toBeInTheDocument();
      expect(screen.getByText(/Grace period complete/)).toBeInTheDocument();
    });

    it('does not show time when expired', () => {
      render(<GracePeriodTimer {...defaultProps} totalMs={0} blocksLeft={0n} status="expired" />);

      expect(screen.queryByText('00:00')).not.toBeInTheDocument();
    });
  });

  describe('urgent state', () => {
    it('shows urgent message when less than 1 minute', () => {
      render(
        <GracePeriodTimer
          {...defaultProps}
          timeRemaining={{ days: 0, hours: 0, minutes: 0, seconds: 30, totalSeconds: 30 }}
          totalMs={30_000}
          blocksLeft={3n}
        />
      );

      expect(screen.getByText('Almost ready!')).toBeInTheDocument();
    });
  });

  describe('time formatting', () => {
    it('shows hours when present', () => {
      render(
        <GracePeriodTimer
          {...defaultProps}
          timeRemaining={{ days: 0, hours: 1, minutes: 23, seconds: 45, totalSeconds: 5025 }}
          totalMs={5_025_000}
        />
      );

      expect(screen.getByText('01:23:45')).toBeInTheDocument();
    });

    it('shows days when present', () => {
      // 2d 5h 30m = (2*86400 + 5*3600 + 30*60) * 1000 = 192_600_000 ms
      render(
        <GracePeriodTimer
          {...defaultProps}
          timeRemaining={{ days: 2, hours: 5, minutes: 30, seconds: 0, totalSeconds: 192600 }}
          totalMs={192_600_000}
        />
      );

      expect(screen.getByText('2d 05:30:00')).toBeInTheDocument();
    });
  });

  describe('progress calculation', () => {
    it('renders progress bar', () => {
      const { container } = render(<GracePeriodTimer {...defaultProps} />);

      const progressBar = container.querySelector('[data-slot="progress"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('handles missing initialTotalMs', () => {
      render(<GracePeriodTimer {...defaultProps} initialTotalMs={undefined} />);

      // Should still render without crashing
      expect(screen.getByText('03:42')).toBeInTheDocument();
    });
  });

  describe('getGracePeriodStatus', () => {
    // The hook keeps isRunning true after the estimate runs out (a later block
    // poll raises it above zero again), so the UI must not flick back to a
    // ticking countdown while the target block is still pending.
    it('prefers waiting-for-block over a still-running timer', () => {
      expect(
        getGracePeriodStatus({ isExpired: false, isRunning: true, isWaitingForBlock: true })
      ).toBe('waiting-for-block');
    });

    it('reports expired regardless of the other flags', () => {
      expect(
        getGracePeriodStatus({ isExpired: true, isRunning: false, isWaitingForBlock: false })
      ).toBe('expired');
    });

    it('reports loading before any timer state', () => {
      expect(
        getGracePeriodStatus({ isExpired: true, isRunning: false, isWaitingForBlock: false }, true)
      ).toBe('loading');
    });

    it('reports paused when time remains but nothing is ticking', () => {
      expect(
        getGracePeriodStatus({ isExpired: false, isRunning: false, isWaitingForBlock: false })
      ).toBe('paused');
    });
  });
});

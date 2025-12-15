import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionCard } from './TransactionCard';

describe('TransactionCard', () => {
  const sampleHash =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;

  const defaultProps = {
    type: 'acknowledgement' as const,
    status: 'idle' as const,
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders acknowledgement type correctly', () => {
      render(<TransactionCard {...defaultProps} />);

      // Content-only component - just check the button exists
      expect(screen.getByRole('button', { name: /Submit Acknowledgement/i })).toBeInTheDocument();
    });

    it('renders registration type correctly', () => {
      render(<TransactionCard {...defaultProps} type="registration" />);

      expect(screen.getByRole('button', { name: /Submit Registration/i })).toBeInTheDocument();
    });

    it('displays Ready badge when idle', () => {
      render(<TransactionCard {...defaultProps} />);

      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });

  describe('submission flow', () => {
    it('calls onSubmit when button is clicked', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TransactionCard {...defaultProps} onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: /Submit Acknowledgement/i }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('shows Submitting badge during submission', () => {
      render(<TransactionCard {...defaultProps} status="submitting" />);

      expect(screen.getByText('Submitting')).toBeInTheDocument();
    });
  });

  describe('pending state', () => {
    it('shows Pending badge', () => {
      render(<TransactionCard {...defaultProps} status="pending" hash={sampleHash} />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('displays transaction hash', () => {
      render(<TransactionCard {...defaultProps} status="pending" hash={sampleHash} />);

      expect(screen.getByText('Transaction Hash')).toBeInTheDocument();
      // Hash is displayed via ExplorerLink component
      const hashElement = screen.getByTestId('explorer-link');
      expect(hashElement).toBeInTheDocument();
      expect(hashElement).toHaveTextContent('0x12345678');
    });

    it('shows waiting message', () => {
      render(<TransactionCard {...defaultProps} status="pending" hash={sampleHash} />);

      expect(screen.getByText(/Waiting for confirmation/i)).toBeInTheDocument();
    });

    it('shows explorer link when URL provided', () => {
      render(
        <TransactionCard
          {...defaultProps}
          status="pending"
          hash={sampleHash}
          explorerUrl="https://etherscan.io/tx/0x123"
        />
      );

      // ExplorerLink renders with nested anchor for explorer link
      const explorerLink = screen.getByTestId('explorer-link');
      const anchor = explorerLink.querySelector('a[href]');
      expect(anchor).toHaveAttribute('href', 'https://etherscan.io/tx/0x123');
    });

    it('hides submit button during pending', () => {
      render(<TransactionCard {...defaultProps} status="pending" hash={sampleHash} />);

      expect(screen.queryByRole('button', { name: /Submit/i })).not.toBeInTheDocument();
    });
  });

  describe('confirmed state', () => {
    it('shows Confirmed badge', () => {
      render(<TransactionCard {...defaultProps} status="confirmed" hash={sampleHash} />);

      expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });

    it('shows acknowledgement success message', () => {
      render(<TransactionCard {...defaultProps} status="confirmed" hash={sampleHash} />);

      expect(screen.getByText(/Grace period has begun/i)).toBeInTheDocument();
    });

    it('shows registration success message', () => {
      render(
        <TransactionCard
          {...defaultProps}
          type="registration"
          status="confirmed"
          hash={sampleHash}
        />
      );

      expect(screen.getByText(/Registration complete/i)).toBeInTheDocument();
    });

    it('hides submit button when confirmed', () => {
      render(<TransactionCard {...defaultProps} status="confirmed" hash={sampleHash} />);

      expect(screen.queryByRole('button', { name: /Submit/i })).not.toBeInTheDocument();
    });
  });

  describe('failed state', () => {
    it('shows Failed badge', () => {
      render(<TransactionCard {...defaultProps} status="failed" error="Error occurred" />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('displays error message', () => {
      render(
        <TransactionCard
          {...defaultProps}
          status="failed"
          error="Transaction reverted: Insufficient gas"
        />
      );

      expect(screen.getByText('Transaction reverted: Insufficient gas')).toBeInTheDocument();
    });

    it('shows retry button', () => {
      render(
        <TransactionCard {...defaultProps} status="failed" error="Error" onRetry={() => {}} />
      );

      expect(screen.getByRole('button', { name: /Retry Transaction/i })).toBeInTheDocument();
    });

    it('calls onRetry when retry button clicked', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      render(<TransactionCard {...defaultProps} status="failed" error="Error" onRetry={onRetry} />);

      await user.click(screen.getByRole('button', { name: /Retry Transaction/i }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('falls back to onSubmit if onRetry not provided', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <TransactionCard {...defaultProps} status="failed" error="Error" onSubmit={onSubmit} />
      );

      await user.click(screen.getByRole('button', { name: /Retry Transaction/i }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('explorer link', () => {
    it('renders explorer link with correct href', () => {
      const explorerUrl = 'https://etherscan.io/tx/0x123';
      render(
        <TransactionCard
          {...defaultProps}
          status="confirmed"
          hash={sampleHash}
          explorerUrl={explorerUrl}
        />
      );

      // ExplorerLink renders with nested anchor for explorer link
      const explorerLink = screen.getByTestId('explorer-link');
      const anchor = explorerLink.querySelector('a[href]');
      expect(anchor).toHaveAttribute('href', explorerUrl);
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});

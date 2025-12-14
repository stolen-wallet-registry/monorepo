import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignatureCard, type SignatureData } from './SignatureCard';

describe('SignatureCard', () => {
  const sampleData: SignatureData = {
    registeree: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    forwarder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    nonce: 0n,
    deadline: 12345678n,
  };

  const defaultProps = {
    type: 'acknowledgement' as const,
    data: sampleData,
    status: 'idle' as const,
    onSign: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    // First test in file needs longer timeout due to cold-start overhead
    it('renders acknowledgement type correctly', { timeout: 10000 }, () => {
      render(<SignatureCard {...defaultProps} />);

      // Title and button both contain the text
      expect(screen.getAllByText(/Sign Acknowledgement/i)).toHaveLength(2);
      expect(screen.getByRole('button', { name: /Sign Acknowledgement/i })).toBeInTheDocument();
    });

    it('renders registration type correctly', () => {
      render(<SignatureCard {...defaultProps} type="registration" />);

      expect(screen.getAllByText(/Sign Registration/i)).toHaveLength(2);
      expect(screen.getByRole('button', { name: /Sign Registration/i })).toBeInTheDocument();
    });

    it('displays signature data', () => {
      render(<SignatureCard {...defaultProps} />);

      expect(screen.getByText('Registeree:')).toBeInTheDocument();
      expect(screen.getByText('Forwarder:')).toBeInTheDocument();
      expect(screen.getByText('Nonce:')).toBeInTheDocument();
      expect(screen.getByText('Deadline:')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument(); // nonce
      expect(screen.getByText('Block 12345678')).toBeInTheDocument();
    });
  });

  describe('signing flow', () => {
    it('calls onSign when button is clicked', async () => {
      const user = userEvent.setup();
      const onSign = vi.fn();
      render(<SignatureCard {...defaultProps} onSign={onSign} />);

      await user.click(screen.getByRole('button', { name: /Sign Acknowledgement/i }));

      expect(onSign).toHaveBeenCalledTimes(1);
    });

    it('shows loading state during signing', () => {
      render(<SignatureCard {...defaultProps} status="signing" />);

      expect(screen.getByText(/Waiting for signature/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Waiting for signature/i })).toBeDisabled();
    });

    it('button is disabled during signing', () => {
      render(<SignatureCard {...defaultProps} status="signing" />);

      expect(screen.getByRole('button', { name: /Waiting for signature/i })).toBeDisabled();
    });
  });

  describe('success state', () => {
    const signature =
      '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8538dde03fc8b4c6d7f2c13c82e5c34d0e5f8b1c0b5e2f3a4b5c6d7e8f9a0b1c21b' as `0x${string}`;

    it('shows signed badge on success', () => {
      render(<SignatureCard {...defaultProps} status="success" signature={signature} />);

      expect(screen.getByText('Signed')).toBeInTheDocument();
    });

    it('shows signature preview on success', () => {
      render(<SignatureCard {...defaultProps} status="success" signature={signature} />);

      expect(screen.getByText('Signature')).toBeInTheDocument();
      // Check for truncated signature
      expect(screen.getByText(/0x1c8aff950685c2ed/)).toBeInTheDocument();
    });

    it('hides sign button on success', () => {
      render(<SignatureCard {...defaultProps} status="success" signature={signature} />);

      // The "Sign Acknowledgement" / "Sign Registration" button should be hidden
      expect(
        screen.queryByRole('button', { name: /Sign Acknowledgement/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sign Registration/i })).not.toBeInTheDocument();
    });

    it('shows completion message on success', () => {
      render(<SignatureCard {...defaultProps} status="success" signature={signature} />);

      expect(screen.getByText('Signature complete')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('displays error message', () => {
      render(
        <SignatureCard
          {...defaultProps}
          status="error"
          error="User rejected the signature request"
        />
      );

      expect(screen.getByText('User rejected the signature request')).toBeInTheDocument();
    });

    it('shows retry button on error', () => {
      render(
        <SignatureCard {...defaultProps} status="error" error="Error occurred" onRetry={() => {}} />
      );

      expect(screen.getByRole('button', { name: /Retry Signing/i })).toBeInTheDocument();
    });

    it('calls onRetry when retry button is clicked', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      render(
        <SignatureCard {...defaultProps} status="error" error="Error occurred" onRetry={onRetry} />
      );

      await user.click(screen.getByRole('button', { name: /Retry Signing/i }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('falls back to onSign if onRetry not provided', async () => {
      const user = userEvent.setup();
      const onSign = vi.fn();
      render(
        <SignatureCard {...defaultProps} status="error" error="Error occurred" onSign={onSign} />
      );

      await user.click(screen.getByRole('button', { name: /Retry Signing/i }));

      expect(onSign).toHaveBeenCalledTimes(1);
    });
  });
});

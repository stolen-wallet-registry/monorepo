import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WalletSwitchPrompt } from './WalletSwitchPrompt';

describe('WalletSwitchPrompt', () => {
  const stolenWallet = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
  const gasWallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as `0x${string}`;

  describe('correct wallet', () => {
    it('shows success message when correct wallet connected', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={stolenWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText('Correct Wallet Connected')).toBeInTheDocument();
    });

    it('displays wallet label', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={stolenWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText(/Stolen Wallet/)).toBeInTheDocument();
    });
  });

  describe('wrong wallet', () => {
    it('shows switch required message', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={gasWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText('Switch Wallet Required')).toBeInTheDocument();
    });

    it('shows current and expected addresses', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={gasWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText('Current:')).toBeInTheDocument();
      expect(screen.getByText('Expected:')).toBeInTheDocument();
    });

    it('shows expected wallet label', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={gasWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Gas Wallet"
        />
      );

      // Label appears in multiple places - in the message and next to the address
      const labels = screen.getAllByText(/Gas Wallet/);
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  describe('disconnected', () => {
    it('shows disconnected message', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={null}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText('Wallet Not Connected')).toBeInTheDocument();
    });

    it('shows expected wallet label in message', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={null}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText(/Stolen Wallet/)).toBeInTheDocument();
    });

    it('shows expected address', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={null}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      // Check for truncated address
      expect(screen.getByText(/Expected:/)).toBeInTheDocument();
    });
  });

  describe('wrong network', () => {
    it('shows wrong network message', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={stolenWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
          currentChainId={1}
          expectedChainId={8453}
        />
      );

      expect(screen.getByText('Wrong Network')).toBeInTheDocument();
    });

    it('shows chain IDs', () => {
      render(
        <WalletSwitchPrompt
          currentAddress={stolenWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
          currentChainId={1}
          expectedChainId={8453}
        />
      );

      expect(screen.getByText('Chain 1')).toBeInTheDocument();
      expect(screen.getByText('Chain 8453')).toBeInTheDocument();
    });

    it('prioritizes network check over wallet check', () => {
      // Even with correct wallet, wrong network should show network error
      render(
        <WalletSwitchPrompt
          currentAddress={stolenWallet}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
          currentChainId={1}
          expectedChainId={8453}
        />
      );

      expect(screen.getByText('Wrong Network')).toBeInTheDocument();
      expect(screen.queryByText('Correct Wallet Connected')).not.toBeInTheDocument();
    });
  });

  describe('address comparison', () => {
    it('handles case-insensitive address comparison', () => {
      const lowerCase = stolenWallet.toLowerCase() as `0x${string}`;
      render(
        <WalletSwitchPrompt
          currentAddress={lowerCase}
          expectedAddress={stolenWallet}
          expectedLabel="Stolen Wallet"
        />
      );

      expect(screen.getByText('Correct Wallet Connected')).toBeInTheDocument();
    });
  });
});

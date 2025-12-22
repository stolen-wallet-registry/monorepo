import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegistrySearchResult } from './RegistrySearchResult';
import { TooltipProvider } from '@swr/ui';

// Wrap component with required providers
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('RegistrySearchResult', () => {
  const sampleAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
  const sampleForwarder = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as `0x${string}`;

  describe('registered status', () => {
    const mockRegistrationData = {
      registeredAt: 12345678n,
      sourceChainId: 0,
      bridgeId: 0,
      isSponsored: false,
      crossChainMessageId:
        '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
    };

    it('displays registered alert with destructive styling', () => {
      renderWithProviders(
        <RegistrySearchResult
          address={sampleAddress}
          status="registered"
          registrationData={mockRegistrationData}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Registered as Stolen')).toBeInTheDocument();
      expect(screen.getByText('Compromised')).toBeInTheDocument();
    });

    it('shows registration details when data is provided', () => {
      renderWithProviders(
        <RegistrySearchResult
          address={sampleAddress}
          status="registered"
          registrationData={mockRegistrationData}
        />
      );

      expect(screen.getByText('Registered at block:')).toBeInTheDocument();
      expect(screen.getByText('12345678')).toBeInTheDocument();
    });

    it('shows sponsored badge when registration was sponsored', () => {
      renderWithProviders(
        <RegistrySearchResult
          address={sampleAddress}
          status="registered"
          registrationData={{ ...mockRegistrationData, isSponsored: true }}
        />
      );

      expect(screen.getByText('Sponsored Registration')).toBeInTheDocument();
    });

    it('renders without registration data', () => {
      renderWithProviders(
        <RegistrySearchResult address={sampleAddress} status="registered" registrationData={null} />
      );

      expect(screen.getByText('Registered as Stolen')).toBeInTheDocument();
      expect(screen.queryByText('Registered at block:')).not.toBeInTheDocument();
    });
  });

  describe('pending status', () => {
    it('displays pending alert with warning styling', () => {
      renderWithProviders(
        <RegistrySearchResult
          address={sampleAddress}
          status="pending"
          acknowledgementData={{
            trustedForwarder: sampleForwarder,
            startBlock: 100n,
            expiryBlock: 200n,
          }}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Pending Registration')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('shows acknowledgement details when data is provided', () => {
      renderWithProviders(
        <RegistrySearchResult
          address={sampleAddress}
          status="pending"
          acknowledgementData={{
            trustedForwarder: sampleForwarder,
            startBlock: 100n,
            expiryBlock: 200n,
          }}
        />
      );

      expect(screen.getByText('Trusted forwarder:')).toBeInTheDocument();
      expect(screen.getByText('Grace period starts:')).toBeInTheDocument();
      expect(screen.getByText(/Block 100/)).toBeInTheDocument();
      expect(screen.getByText('Expires:')).toBeInTheDocument();
      expect(screen.getByText(/Block 200/)).toBeInTheDocument();
    });

    it('renders without acknowledgement data', () => {
      renderWithProviders(
        <RegistrySearchResult address={sampleAddress} status="pending" acknowledgementData={null} />
      );

      expect(screen.getByText('Pending Registration')).toBeInTheDocument();
      expect(screen.queryByText('Trusted forwarder:')).not.toBeInTheDocument();
    });
  });

  describe('not-found status', () => {
    it('displays not found alert with success styling', () => {
      renderWithProviders(<RegistrySearchResult address={sampleAddress} status="not-found" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Not Registered')).toBeInTheDocument();
      expect(screen.getByText('Clean')).toBeInTheDocument();
    });

    it('indicates wallet is not in registry', () => {
      renderWithProviders(<RegistrySearchResult address={sampleAddress} status="not-found" />);

      expect(screen.getByText(/is not in the stolen wallet registry/)).toBeInTheDocument();
    });
  });

  describe('address display', () => {
    it('displays full address in all status displays', () => {
      const { rerender } = renderWithProviders(
        <RegistrySearchResult address={sampleAddress} status="registered" />
      );
      // Address should be displayed in full
      expect(screen.getByText(sampleAddress)).toBeInTheDocument();

      rerender(
        <TooltipProvider>
          <RegistrySearchResult address={sampleAddress} status="pending" />
        </TooltipProvider>
      );
      expect(screen.getByText(sampleAddress)).toBeInTheDocument();

      rerender(
        <TooltipProvider>
          <RegistrySearchResult address={sampleAddress} status="not-found" />
        </TooltipProvider>
      );
      expect(screen.getByText(sampleAddress)).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegistrationMethodSelector } from './RegistrationMethodSelector';
import type { RegistrationType } from '@/stores/registrationStore';

describe('RegistrationMethodSelector', () => {
  const defaultProps = {
    selected: null as RegistrationType | null,
    onSelect: vi.fn<(type: RegistrationType) => void>(),
    p2pAvailable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders all three methods', () => {
      render(<RegistrationMethodSelector {...defaultProps} />);

      expect(screen.getByText('Standard Registration')).toBeInTheDocument();
      expect(screen.getByText('Self-Relay Registration')).toBeInTheDocument();
      expect(screen.getByText('P2P Relay Registration')).toBeInTheDocument();
    });

    it('renders descriptions for each method', () => {
      render(<RegistrationMethodSelector {...defaultProps} />);

      expect(screen.getByText(/Sign and pay from the same wallet/)).toBeInTheDocument();
      expect(screen.getByText(/Sign with the stolen wallet, then switch/)).toBeInTheDocument();
      expect(
        screen.getByText(/Sign with your stolen wallet and have a trusted helper/)
      ).toBeInTheDocument();
    });

    it('renders requirements for each method', () => {
      render(<RegistrationMethodSelector {...defaultProps} />);

      expect(screen.getByText('Wallet access')).toBeInTheDocument();
      expect(screen.getByText('Second wallet for gas')).toBeInTheDocument();
      expect(screen.getByText('Connected helper peer')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('shows selected badge when a method is selected', () => {
      render(<RegistrationMethodSelector {...defaultProps} selected="standard" />);

      expect(screen.getByText('Selected')).toBeInTheDocument();
    });

    it('calls onSelect when clicking a method', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<RegistrationMethodSelector {...defaultProps} onSelect={onSelect} />);

      await user.click(screen.getByText('Standard Registration'));

      expect(onSelect).toHaveBeenCalledWith('standard');
    });

    it('calls onSelect when pressing Enter on a method', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<RegistrationMethodSelector {...defaultProps} onSelect={onSelect} />);

      const card = screen
        .getByText('Standard Registration')
        .closest('[role="radio"]') as HTMLElement;
      card.focus();
      await user.keyboard('{Enter}');

      expect(onSelect).toHaveBeenCalledWith('standard');
    });

    it('calls onSelect when pressing Space on a method', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<RegistrationMethodSelector {...defaultProps} onSelect={onSelect} />);

      const card = screen
        .getByText('Self-Relay Registration')
        .closest('[role="radio"]') as HTMLElement;
      card.focus();
      await user.keyboard(' ');

      expect(onSelect).toHaveBeenCalledWith('selfRelay');
    });
  });

  describe('P2P availability', () => {
    it('disables P2P option when not available', () => {
      render(<RegistrationMethodSelector {...defaultProps} p2pAvailable={false} />);

      expect(screen.getByText('No helper peer available')).toBeInTheDocument();
    });

    it('does not call onSelect for disabled P2P method', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <RegistrationMethodSelector {...defaultProps} onSelect={onSelect} p2pAvailable={false} />
      );

      await user.click(screen.getByText('P2P Relay Registration'));

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('allows selecting P2P when available', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <RegistrationMethodSelector {...defaultProps} onSelect={onSelect} p2pAvailable={true} />
      );

      await user.click(screen.getByText('P2P Relay Registration'));

      expect(onSelect).toHaveBeenCalledWith('p2pRelay');
    });
  });

  describe('accessibility', () => {
    it('has radiogroup container with label', () => {
      render(<RegistrationMethodSelector {...defaultProps} />);

      const radiogroup = screen.getByRole('radiogroup');
      expect(radiogroup).toHaveAttribute('aria-label', 'Registration method');
    });

    it('sets aria-checked on selected card', () => {
      render(<RegistrationMethodSelector {...defaultProps} selected="selfRelay" />);

      const selfRelayCard = screen.getByText('Self-Relay Registration').closest('[role="radio"]');
      expect(selfRelayCard).toHaveAttribute('aria-checked', 'true');

      const standardCard = screen.getByText('Standard Registration').closest('[role="radio"]');
      expect(standardCard).toHaveAttribute('aria-checked', 'false');
    });

    it('sets aria-disabled on disabled card', () => {
      render(<RegistrationMethodSelector {...defaultProps} p2pAvailable={false} />);

      const p2pCard = screen.getByText('P2P Relay Registration').closest('[role="radio"]');
      expect(p2pCard).toHaveAttribute('aria-disabled', 'true');
    });

    it('sets tabIndex -1 on disabled card', () => {
      render(<RegistrationMethodSelector {...defaultProps} p2pAvailable={false} />);

      const p2pCard = screen.getByText('P2P Relay Registration').closest('[role="radio"]');
      expect(p2pCard).toHaveAttribute('tabIndex', '-1');
    });
  });
});

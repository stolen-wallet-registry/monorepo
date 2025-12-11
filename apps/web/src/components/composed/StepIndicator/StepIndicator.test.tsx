import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepIndicator } from './StepIndicator';

describe('StepIndicator', () => {
  describe('standard flow', () => {
    it('renders all steps for standard flow', () => {
      render(<StepIndicator registrationType="standard" currentStep="acknowledge-and-sign" />);

      expect(screen.getByText('Sign Acknowledgement')).toBeInTheDocument();
      expect(screen.getByText('Submit Acknowledgement')).toBeInTheDocument();
      expect(screen.getByText('Wait for Grace Period')).toBeInTheDocument();
      expect(screen.getByText('Sign Registration')).toBeInTheDocument();
      expect(screen.getByText('Submit Registration')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('marks previous steps as completed', () => {
      const { container } = render(
        <StepIndicator registrationType="standard" currentStep="grace-period" />
      );

      // Check that completed steps have green styling
      const steps = container.querySelectorAll('li');
      expect(steps).toHaveLength(6);

      // First two steps should be completed (green check)
      const checkIcons = container.querySelectorAll('svg.lucide-check');
      expect(checkIcons).toHaveLength(2);
    });

    it('marks current step with loader', () => {
      const { container } = render(
        <StepIndicator registrationType="standard" currentStep="grace-period" />
      );

      // Look for the spinner (has animate-spin class)
      const spinners = container.querySelectorAll('.animate-spin');
      expect(spinners).toHaveLength(1);
    });
  });

  describe('self-relay flow', () => {
    it('renders self-relay specific steps', () => {
      render(<StepIndicator registrationType="selfRelay" currentStep="switch-and-pay-one" />);

      expect(screen.getByText('Sign Acknowledgement')).toBeInTheDocument();
      // Two "Switch Wallet & Submit" steps in self-relay (for ACK and REG)
      expect(screen.getAllByText('Switch Wallet & Submit')).toHaveLength(2);
      expect(screen.getByText('Wait for Grace Period')).toBeInTheDocument();
    });
  });

  describe('p2p flow', () => {
    it('renders p2p specific steps', () => {
      render(<StepIndicator registrationType="p2pRelay" currentStep="wait-for-connection" />);

      expect(screen.getByText('Connect to Helper')).toBeInTheDocument();
      expect(screen.getByText('Wait for Submission')).toBeInTheDocument();
      expect(screen.getByText('Wait for Registration')).toBeInTheDocument();
    });

    it('renders 7 steps for p2p flow', () => {
      const { container } = render(
        <StepIndicator registrationType="p2pRelay" currentStep="wait-for-connection" />
      );

      const steps = container.querySelectorAll('li');
      expect(steps).toHaveLength(7);
    });
  });

  describe('custom labels', () => {
    it('uses custom labels when provided', () => {
      render(
        <StepIndicator
          registrationType="standard"
          currentStep="acknowledge-and-sign"
          stepLabels={{
            'acknowledge-and-sign': 'Custom Label 1',
            'grace-period': 'Custom Label 3',
          }}
        />
      );

      expect(screen.getByText('Custom Label 1')).toBeInTheDocument();
      expect(screen.getByText('Custom Label 3')).toBeInTheDocument();
      // Non-customized steps use defaults
      expect(screen.getByText('Submit Acknowledgement')).toBeInTheDocument();
    });
  });

  describe('step descriptions', () => {
    it('renders descriptions when provided', () => {
      render(
        <StepIndicator
          registrationType="standard"
          currentStep="acknowledge-and-sign"
          stepDescriptions={{
            'acknowledge-and-sign': 'Sign with your wallet',
            'grace-period': 'Please wait',
          }}
        />
      );

      expect(screen.getByText('Sign with your wallet')).toBeInTheDocument();
      expect(screen.getByText('Please wait')).toBeInTheDocument();
    });
  });

  describe('null current step', () => {
    it('marks all steps as pending when no current step', () => {
      const { container } = render(
        <StepIndicator registrationType="standard" currentStep={null} />
      );

      // No completed checks
      const checkIcons = container.querySelectorAll('svg.lucide-check');
      expect(checkIcons).toHaveLength(0);

      // No spinners
      const spinners = container.querySelectorAll('svg.lucide-loader-2');
      expect(spinners).toHaveLength(0);

      // All circles (pending)
      const circles = container.querySelectorAll('svg.lucide-circle');
      expect(circles).toHaveLength(6);
    });
  });

  describe('accessibility', () => {
    it('has navigation landmark', () => {
      render(<StepIndicator registrationType="standard" currentStep="acknowledge-and-sign" />);

      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Registration progress');
    });

    it('uses ordered list', () => {
      render(<StepIndicator registrationType="standard" currentStep="acknowledge-and-sign" />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });
  });
});

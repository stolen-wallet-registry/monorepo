/**
 * The alert is the only place the user is told that Retry will not resubmit. On the P2P
 * path it is also the only place they are told that the fix is not theirs to perform, so
 * these assertions are about the message being actionable, not about markup.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';

import { SignatureInvalidatedAlert } from './SignatureInvalidatedAlert';

describe('SignatureInvalidatedAlert', () => {
  it('tells a self-signing user Retry will send them back to sign', () => {
    render(<SignatureInvalidatedAlert />);
    expect(screen.getByText(/can no longer be used/i)).toBeInTheDocument();
    expect(screen.getByText(/take you back to sign/i)).toBeInTheDocument();
  });

  it('tells a self-signing user a closed window restarts from acknowledgement', () => {
    render(<SignatureInvalidatedAlert windowClosed />);
    expect(
      screen.getByText(/restart the process from the acknowledgement step/i)
    ).toBeInTheDocument();
  });

  // A relayer cannot re-sign for their partner. Saying "Retry will take you back to sign"
  // would be a lie on this path, and leaves the partner waiting on a screen that never moves.
  it('tells a relayer the partner has to sign, not them', () => {
    render(<SignatureInvalidatedAlert partner={{ notified: null, role: 'registeree' }} />);
    expect(screen.getByText(/not yours to replace/i)).toBeInTheDocument();
    expect(screen.getByText(/registeree has to sign again/i)).toBeInTheDocument();
  });

  it('names the reporter in the transaction flow', () => {
    render(<SignatureInvalidatedAlert partner={{ notified: null, role: 'reporter' }} />);
    expect(screen.getByText(/reporter has to sign again/i)).toBeInTheDocument();
  });

  it('confirms when the re-sign request reached the partner', () => {
    render(<SignatureInvalidatedAlert partner={{ notified: true, role: 'registeree' }} />);
    expect(screen.getByText(/has been sent to them/i)).toBeInTheDocument();
  });

  // Delivery is best-effort and, until the counterpart protocol lands, expected to fail.
  // Silently claiming success would strand the partner, so non-delivery must be explicit
  // and must name the fallback.
  it('says so, and names the fallback, when the request could not be delivered', () => {
    render(<SignatureInvalidatedAlert partner={{ notified: false, role: 'reporter' }} />);
    expect(screen.getByText(/could not be delivered/i)).toBeInTheDocument();
    expect(screen.getByText(/contact them directly/i)).toBeInTheDocument();
  });

  it('tells a relayer a closed window means their partner restarts from acknowledgement', () => {
    render(
      <SignatureInvalidatedAlert windowClosed partner={{ notified: true, role: 'registeree' }} />
    );
    expect(screen.getByText(/start again from the acknowledgement/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot sign on their behalf/i)).toBeInTheDocument();
  });
});

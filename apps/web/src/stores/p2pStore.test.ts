import { describe, it, expect, beforeEach } from 'vitest';
import { useP2PStore, isPreConnectionStep } from './p2pStore';

beforeEach(() => {
  useP2PStore.setState({ peerId: null, partnerPeerId: null });
});

describe('clearPartnerPeerId', () => {
  it('drops the pinned partner', () => {
    useP2PStore.getState().setPartnerPeerId('12D3KooWOldPartner');

    useP2PStore.getState().clearPartnerPeerId();

    expect(useP2PStore.getState().partnerPeerId).toBeNull();
  });

  // The pin is the only thing that survives a reload, so clearing it must not take the
  // local node identity with it.
  it('leaves the local peer ID alone', () => {
    useP2PStore.setState({ peerId: '12D3KooWSelf', partnerPeerId: '12D3KooWOldPartner' });

    useP2PStore.getState().clearPartnerPeerId();

    expect(useP2PStore.getState().peerId).toBe('12D3KooWSelf');
  });
});

describe('isPreConnectionStep', () => {
  // A fresh flow: any persisted partnerPeerId here is a leftover from an abandoned tab, and
  // keeping it makes the guard silently reject the NEXT partner's CONNECT.
  it('treats the pre-connection step and a null step as fresh', () => {
    expect(isPreConnectionStep('wait-for-connection')).toBe(true);
    expect(isPreConnectionStep(null)).toBe(true);
    expect(isPreConnectionStep(undefined)).toBe(true);
  });

  // The other half, and the reason partnerPeerId stays in `partialize`: reloading mid-flow
  // must come back with the partner still pinned.
  it('treats every mid-flow step as NOT fresh, so a reload keeps its pin', () => {
    for (const step of [
      'acknowledge-and-sign',
      'acknowledgement-payment',
      'grace-period',
      'register-and-sign',
      'registration-payment',
      'select-transactions',
      'acknowledge-sign',
      'register-pay',
      'success',
    ]) {
      expect(isPreConnectionStep(step)).toBe(false);
    }
  });
});

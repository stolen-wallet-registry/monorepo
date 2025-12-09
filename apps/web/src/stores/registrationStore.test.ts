import { describe, it, expect, beforeEach } from 'vitest';
import {
  useRegistrationStore,
  getNextStep,
  getPreviousStep,
  STEP_SEQUENCES,
} from './registrationStore';

describe('registrationStore', () => {
  beforeEach(() => {
    useRegistrationStore.getState().reset();
  });

  describe('initial state', () => {
    it('has default registration type of standard', () => {
      const state = useRegistrationStore.getState();
      expect(state.registrationType).toBe('standard');
    });

    it('has null step initially (set when type is selected)', () => {
      const state = useRegistrationStore.getState();
      expect(state.step).toBeNull();
    });

    it('has null hashes initially', () => {
      const state = useRegistrationStore.getState();
      expect(state.acknowledgementHash).toBeNull();
      expect(state.registrationHash).toBeNull();
    });
  });

  describe('setRegistrationType', () => {
    it('changes registration type and resets step', () => {
      const { setRegistrationType } = useRegistrationStore.getState();

      setRegistrationType('p2pRelay');
      const state = useRegistrationStore.getState();

      expect(state.registrationType).toBe('p2pRelay');
      expect(state.step).toBe('wait-for-connection');
    });

    it('sets selfRelay initial step correctly', () => {
      const { setRegistrationType } = useRegistrationStore.getState();

      setRegistrationType('selfRelay');
      const state = useRegistrationStore.getState();

      expect(state.step).toBe('acknowledge-and-sign');
    });
  });

  describe('setStep', () => {
    it('updates current step', () => {
      const { setStep } = useRegistrationStore.getState();

      setStep('grace-period');
      expect(useRegistrationStore.getState().step).toBe('grace-period');
    });
  });

  describe('setAcknowledgementHash', () => {
    it('stores acknowledgement transaction hash', () => {
      const { setAcknowledgementHash } = useRegistrationStore.getState();
      const hash = '0x123abc';

      setAcknowledgementHash(hash as `0x${string}`);
      expect(useRegistrationStore.getState().acknowledgementHash).toBe(hash);
    });
  });

  describe('setRegistrationHash', () => {
    it('stores registration transaction hash', () => {
      const { setRegistrationHash } = useRegistrationStore.getState();
      const hash = '0x456def';

      setRegistrationHash(hash as `0x${string}`);
      expect(useRegistrationStore.getState().registrationHash).toBe(hash);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const store = useRegistrationStore.getState();
      store.setRegistrationType('p2pRelay');
      store.setStep('success');
      store.setAcknowledgementHash('0x123' as `0x${string}`);
      store.setRegistrationHash('0x456' as `0x${string}`);

      store.reset();

      const state = useRegistrationStore.getState();
      expect(state.registrationType).toBe('standard');
      expect(state.step).toBeNull(); // step is null until type is explicitly selected
      expect(state.acknowledgementHash).toBeNull();
      expect(state.registrationHash).toBeNull();
    });
  });
});

describe('step navigation helpers', () => {
  describe('getNextStep', () => {
    it('returns next step in sequence', () => {
      expect(getNextStep('standard', 'acknowledge-and-sign')).toBe('acknowledge-and-pay');
      expect(getNextStep('standard', 'acknowledge-and-pay')).toBe('grace-period');
    });

    it('returns null at end of sequence', () => {
      expect(getNextStep('standard', 'success')).toBeNull();
    });

    it('handles p2pRelay sequence', () => {
      expect(getNextStep('p2pRelay', 'wait-for-connection')).toBe('acknowledge-and-sign');
    });
  });

  describe('getPreviousStep', () => {
    it('returns previous step in sequence', () => {
      expect(getPreviousStep('standard', 'acknowledge-and-pay')).toBe('acknowledge-and-sign');
      expect(getPreviousStep('standard', 'grace-period')).toBe('acknowledge-and-pay');
    });

    it('returns null at start of sequence', () => {
      expect(getPreviousStep('standard', 'acknowledge-and-sign')).toBeNull();
    });
  });
});

describe('STEP_SEQUENCES', () => {
  it('has correct standard sequence', () => {
    expect(STEP_SEQUENCES.standard).toEqual([
      'acknowledge-and-sign',
      'acknowledge-and-pay',
      'grace-period',
      'register-and-sign',
      'register-and-pay',
      'success',
    ]);
  });

  it('has correct selfRelay sequence', () => {
    expect(STEP_SEQUENCES.selfRelay).toEqual([
      'acknowledge-and-sign',
      'switch-and-pay-one',
      'grace-period',
      'register-and-sign',
      'switch-and-pay-two',
      'success',
    ]);
  });

  it('has correct p2pRelay sequence', () => {
    expect(STEP_SEQUENCES.p2pRelay).toEqual([
      'wait-for-connection',
      'acknowledge-and-sign',
      'acknowledgement-payment',
      'grace-period',
      'register-and-sign',
      'registration-payment',
      'success',
    ]);
  });
});

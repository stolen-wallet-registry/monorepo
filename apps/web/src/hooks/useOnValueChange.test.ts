import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOnValueChange } from './useOnValueChange';

describe('useOnValueChange', () => {
  // The whole point: the transaction pages cleared their persisted selection on mount
  // because the effect was keyed on [chainId], which is truthy from the first render.
  it('does not fire on mount', () => {
    const onChange = vi.fn();

    renderHook(({ value }) => useOnValueChange(value, onChange), {
      initialProps: { value: 8453 },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires with the new and previous value on a real change', () => {
    const onChange = vi.fn();

    const { rerender } = renderHook(({ value }) => useOnValueChange(value, onChange), {
      initialProps: { value: 8453 },
    });

    rerender({ value: 10 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10, 8453);
  });

  it('does not fire when the value is re-set to the same thing', () => {
    const onChange = vi.fn();

    const { rerender } = renderHook(({ value }) => useOnValueChange(value, onChange), {
      initialProps: { value: 8453 },
    });

    rerender({ value: 8453 });
    rerender({ value: 8453 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires once per change across a sequence', () => {
    const onChange = vi.fn();

    const { rerender } = renderHook(({ value }) => useOnValueChange(value, onChange), {
      initialProps: { value: 1 },
    });

    rerender({ value: 2 });
    rerender({ value: 2 });
    rerender({ value: 3 });

    expect(onChange.mock.calls).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  // Pages pass an inline arrow function; if the callback identity re-armed the effect it
  // would fire on every render, which is the bug this hook exists to avoid.
  it('does not fire when only the callback identity changes', () => {
    const calls: string[] = [];

    const { rerender } = renderHook(
      ({ value, tag }) => useOnValueChange(value, () => calls.push(tag)),
      { initialProps: { value: 1, tag: 'a' } }
    );

    rerender({ value: 1, tag: 'b' });
    rerender({ value: 1, tag: 'c' });

    expect(calls).toEqual([]);
  });

  // A wallet disconnecting is a real transition and must still clear.
  it('treats a transition to undefined as a change', () => {
    const onChange = vi.fn();

    const { rerender } = renderHook(
      ({ value }: { value: string | undefined }) => useOnValueChange(value, onChange),
      { initialProps: { value: '0xabc' as string | undefined } }
    );

    rerender({ value: undefined });

    expect(onChange).toHaveBeenCalledWith(undefined, '0xabc');
  });
});

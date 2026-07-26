import { useEffect, useRef } from 'react';

/**
 * Run an effect only when a value actually changes, never on mount.
 *
 * `useEffect(..., [chainId])` fires on mount as well as on change, so an effect written as
 * "when the chain switches, clear the selection" also clears it on every mount — including
 * the mount after a page reload, where the persisted selection is exactly what needs to
 * survive. The transaction flows lost their acknowledged batch that way and dead-ended on
 * "Missing registration data. Please start over", discarding a paid acknowledgement and its
 * grace period.
 *
 * The callback is held in a ref, so an inline arrow function does not re-arm the effect.
 *
 * @param value - Value to watch; compared with Object.is
 * @param onChange - Called with the new and previous value on a real transition
 */
export function useOnValueChange<T>(value: T, onChange: (next: T, previous: T) => void): void {
  const previousRef = useRef<T>(value);
  const isFirstRunRef = useRef(true);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      previousRef.current = value;
      return;
    }

    const previous = previousRef.current;
    if (Object.is(previous, value)) return;

    previousRef.current = value;
    onChangeRef.current(value, previous);
  }, [value]);
}

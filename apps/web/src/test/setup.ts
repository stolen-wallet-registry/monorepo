/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';

/**
 * Make jsdom's Web Storage win over Node's built-in experimental one.
 *
 * Node ships an experimental global `localStorage`/`sessionStorage` (enabled by
 * `--experimental-webstorage`, and on by default in some builds / when NODE_OPTIONS carries
 * the flag). When it is present it can shadow the jsdom implementation that the environment
 * installs, and every store that persists through zustand or reads sessionStorage directly
 * fails with `storage.setItem is not a function` — dozens of tests failing for a reason that
 * has nothing to do with the code under test, on developer machines but not in CI (which
 * pins Node via .nvmrc).
 *
 * Re-binding both globals to the jsdom window's implementations makes the suite independent
 * of the Node version. If jsdom is somehow not providing them, fail loudly and name the
 * cause rather than letting individual tests fail with an unrelated-looking message.
 */
function alignWebStorageWithJsdom(): void {
  if (typeof window === 'undefined') return; // node environment tests: nothing to align

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const jsdomStorage = Object.getOwnPropertyDescriptor(window, name)?.value ?? window[name];

    if (!jsdomStorage || typeof jsdomStorage.setItem !== 'function') {
      throw new Error(
        `jsdom did not provide a usable ${name}. Node ${process.version} may be shadowing it ` +
          'with its experimental Web Storage global — run the suite on the Node version in ' +
          '.nvmrc, or drop --experimental-webstorage from NODE_OPTIONS.'
      );
    }

    if (globalThis[name] !== jsdomStorage) {
      Object.defineProperty(globalThis, name, {
        value: jsdomStorage,
        configurable: true,
        writable: true,
      });
    }
  }
}

alignWebStorageWithJsdom();

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

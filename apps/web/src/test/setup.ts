/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';

/**
 * Guarantee a usable, self-consistent Web Storage for the suite.
 *
 * On some Node versions (observed on Node 25, which enables Web Storage by default) the
 * globals the jsdom environment ends up exposing are not jsdom's. Two distinct symptoms, both
 * seen in the same process:
 *
 *  1. **`localStorage` is an inert plain object** with no `setItem`. Every store that persists
 *     through zustand dies with `localStorage.clear is not a function` — dozens of tests
 *     failing for a reason that has nothing to do with the code under test, on developer
 *     machines but not in CI (which pins Node via .nvmrc).
 *  2. **`sessionStorage` works but is not an instance of the environment's `Storage`.** It
 *     writes and reads fine, so a write-probe alone calls it healthy — but
 *     `vi.spyOn(Storage.prototype, 'setItem')` then patches a prototype nothing is using, and
 *     the tests that simulate a quota failure (`transactions/storage.test.ts`,
 *     `p2p/peerId.test.ts`) silently stop simulating anything.
 *
 * So "does it work" is not the whole question; "is it the same implementation the tests can
 * reach through `Storage.prototype`" is the other half, and both are checked below.
 *
 * Two facts rule out the more obvious fixes:
 *
 *  - **There is no good jsdom implementation hiding behind the broken one.** `globalThis`,
 *    `window`, and the value returned by invoking jsdom's own `localStorage` getter are all the
 *    SAME inert object, so "re-bind the global to jsdom's version" has nothing to bind to.
 *    Only an implementation supplied here can fix it.
 *  - **Substituting one storage is not enough.** Because the fix has to align `Storage` itself
 *    (so prototype spying reaches the instances), the two storages must come from the same
 *    implementation. They are therefore replaced together or not at all.
 *
 * Nothing here runs on a healthy environment: real jsdom storage passes both checks, so CI and
 * anyone on the pinned Node sees no substitution at all. And this never throws — a false
 * positive would take down every test file in the suite before a single test ran, which is far
 * worse than the failure being guarded against.
 *
 * A substitution does `console.warn`, but note that vitest's console interception does not
 * surface output from setup files in the default reporter; run with `--disable-console-intercept`
 * to see it. To assert on it from a test, check `Storage.name === 'InMemoryStorage'`.
 */
const STORAGE_PROBE_KEY = '__swr_storage_probe__';

/**
 * A minimal spec-shaped `Storage` backed by a Map.
 *
 * A class rather than an object literal so its methods live on a prototype: the substitution
 * below points the global `Storage` at this class, which is what lets
 * `vi.spyOn(Storage.prototype, 'setItem')` actually intercept calls made through
 * `sessionStorage`. An object literal with own methods would shadow any prototype spy and
 * quietly defeat the quota-failure tests.
 *
 * `length` and `key()` are implemented rather than stubbed because production code relies on
 * them: `clearAllSignatures` / `clearAllTxSignatures` enumerate sessionStorage by index to find
 * their prefixed keys, so a shim without them would make those functions silently no-op and
 * the tests covering them pass for the wrong reason. Values are coerced with `String()`, as the
 * real Storage does.
 */
class InMemoryStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    const value = this.entries.get(String(key));
    return value === undefined ? null : value;
  }

  key(index: number): string | null {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }
}

/** The stored keys, read through the public Storage API only. */
function storedKeys(storage: InMemoryStorage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index) as string);
}

/**
 * Wrap the shim so stored entries behave like real Storage entries.
 *
 * A real `Storage` exposes its keys as own enumerable properties — `Object.keys(sessionStorage)`
 * lists what is stored, and `storage.foo` reads it. `peerId.test.ts` asserts on exactly that to
 * prove no wallet address leaks into a storage key, so a plain object would fail it while also
 * exposing the shim's own internals. The proxy hides those internals (`ownKeys` reports only
 * stored keys) and forwards everything else to the instance, so `Storage.prototype` spies and
 * `instanceof Storage` keep working through it.
 */
function createStorage(): Storage {
  const target = new InMemoryStorage();

  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && !Reflect.has(t, prop)) {
        return t.getItem(prop) ?? undefined;
      }
      return Reflect.get(t, prop, receiver);
    },
    set(t, prop, value, receiver) {
      if (typeof prop === 'string' && !Reflect.has(t, prop)) {
        t.setItem(prop, value as string);
        return true;
      }
      return Reflect.set(t, prop, value, receiver);
    },
    has(t, prop) {
      return (typeof prop === 'string' && t.getItem(prop) !== null) || Reflect.has(t, prop);
    },
    deleteProperty(t, prop) {
      if (typeof prop === 'string') t.removeItem(prop);
      return true;
    },
    ownKeys(t) {
      return storedKeys(t);
    },
    getOwnPropertyDescriptor(t, prop) {
      if (typeof prop !== 'string') return undefined;
      const value = t.getItem(prop);
      if (value === null) return undefined;
      return { value, writable: true, enumerable: true, configurable: true };
    },
  }) as unknown as Storage;
}

/**
 * Whether `candidate` is a Storage the suite can rely on.
 *
 * Two conditions, for the two symptoms in the docblock above:
 *
 *  - It survives an actual write/read/remove round trip. Established by using it, not by
 *    inspecting its shape — the inert object passes several plausible shape checks and fails
 *    the first `setItem`.
 *  - It is an instance of the ambient `Storage`, so a `Storage.prototype` spy reaches it.
 *    Skipped when the environment exposes no `Storage` constructor at all, since there is then
 *    nothing for a test to spy on either.
 */
function isUsableStorage(candidate: unknown): candidate is Storage {
  if (!candidate || typeof candidate !== 'object') return false;

  const storage = candidate as Storage;
  if (typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    return false;
  }

  const StorageCtor = (globalThis as { Storage?: unknown }).Storage;
  if (typeof StorageCtor === 'function' && !(candidate instanceof StorageCtor)) {
    return false;
  }

  try {
    storage.setItem(STORAGE_PROBE_KEY, 'probe');
    const readBack = storage.getItem(STORAGE_PROBE_KEY);
    storage.removeItem(STORAGE_PROBE_KEY);
    return readBack === 'probe';
  } catch {
    return false;
  }
}

/** Define a global on both `globalThis` and `window` (the same object under jsdom). */
function defineGlobal(name: string, value: unknown): void {
  for (const target of new Set<object>([globalThis, window])) {
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
  }
}

function ensureWebStorage(): void {
  if (typeof window === 'undefined') return; // node environment tests: nothing to install

  const names = ['localStorage', 'sessionStorage'] as const;
  if (names.every((name) => isUsableStorage(globalThis[name]))) return;

  console.warn(
    `[test setup] Web Storage on Node ${process.version} is not the environment's own ` +
      '(localStorage inert and/or sessionStorage not an instance of Storage) — substituting an ' +
      'in-memory implementation so the suite can run.'
  );

  // `Storage` is realigned first so the instances created below are instances of it, which is
  // what makes `vi.spyOn(Storage.prototype, ...)` effective for the quota-failure tests.
  defineGlobal('Storage', InMemoryStorage);
  for (const name of names) {
    defineGlobal(name, createStorage());
  }
}

ensureWebStorage();

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

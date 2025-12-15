/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

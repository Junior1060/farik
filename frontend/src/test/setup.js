import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom implements neither of these; several pages call them in effects.
Element.prototype.scrollIntoView = vi.fn();

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:mock');
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();

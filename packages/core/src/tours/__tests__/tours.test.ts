/**
 * Unit tests for the tour system.
 *
 * Verifies structural invariants without launching browser UI:
 *  1. Every TourId has an entry in TOURS.
 *  2. Every TourId has at least one launcher in HELP_TOUR_DEFS.
 *  3. Every step's element is a non-empty string.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock driver.js and its CSS import — not needed for structural checks.
vi.mock('driver.js', () => ({
  driver: vi.fn(),
}));
vi.mock('driver.js/dist/driver.css', () => ({}));

// Mock the store — tours.ts imports it for runtime mode-switching only,
// not for the static step definitions we are testing here.
vi.mock('../../store/index.js', () => ({
  useAppStore: { getState: vi.fn(() => ({})) },
}));

import { TOURS, HELP_TOUR_DEFS, type TourId } from '../index.js';

// Derive the full set of TourIds from TOURS (single source of truth).
const ALL_TOUR_IDS = Object.keys(TOURS) as TourId[];

describe('TOURS registry', () => {
  it('has a non-empty steps array for every TourId', () => {
    for (const id of ALL_TOUR_IDS) {
      const steps = TOURS[id];
      expect(Array.isArray(steps), `TOURS["${id}"] should be an array`).toBe(true);
      expect(steps.length, `TOURS["${id}"] should have at least one step`).toBeGreaterThan(0);
    }
  });

  it('every step element is a non-empty string', () => {
    for (const id of ALL_TOUR_IDS) {
      const steps = TOURS[id];
      steps.forEach((step, i) => {
        expect(
          typeof step.element === 'string' && step.element.trim().length > 0,
          `TOURS["${id}"][${i}].element should be a non-empty string, got: ${JSON.stringify(step.element)}`
        ).toBe(true);
      });
    }
  });
});

describe('HELP_TOUR_DEFS', () => {
  it('every TourId has at least one launcher in HELP_TOUR_DEFS', () => {
    const coveredIds = new Set(HELP_TOUR_DEFS.map((d) => d.id));
    for (const id of ALL_TOUR_IDS) {
      expect(
        coveredIds.has(id),
        `TourId "${id}" has no entry in HELP_TOUR_DEFS`
      ).toBe(true);
    }
  });

  it('every HELP_TOUR_DEFS entry references a valid TourId', () => {
    const validIds = new Set(ALL_TOUR_IDS);
    for (const def of HELP_TOUR_DEFS) {
      expect(
        validIds.has(def.id),
        `HELP_TOUR_DEFS references unknown TourId "${def.id}"`
      ).toBe(true);
    }
  });

  it('every HELP_TOUR_DEFS entry has a non-empty label', () => {
    for (const def of HELP_TOUR_DEFS) {
      expect(
        typeof def.label === 'string' && def.label.trim().length > 0,
        `HELP_TOUR_DEFS entry for "${def.id}" has an empty label`
      ).toBe(true);
    }
  });
});

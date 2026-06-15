import { describe, it, expect } from 'vitest';
import { showsTrajectory, RING_ONLY_CATEGORIES } from './category';
import { CATEGORIES } from '../schema';

describe('showsTrajectory', () => {
  it('engagement-envelope systems show only a ring (no trajectory arc)', () => {
    for (const c of ['surface-to-air', 'air-to-air', 'anti-tank', 'anti-ship', 'ballistic-missile-defence'] as const) {
      expect(showsTrajectory(c)).toBe(false);
    }
  });

  it('flight systems keep their trajectory arc', () => {
    for (const c of ['surface-to-surface', 'submarine-launched', 'cruise', 'air-to-surface', 'anti-satellite', 'technology-demonstrator', 'other'] as const) {
      expect(showsTrajectory(c)).toBe(true);
    }
  });

  // Forces a deliberate decision whenever a new Category is added to the schema.
  it('classifies every schema category consistently with RING_ONLY_CATEGORIES', () => {
    for (const c of CATEGORIES) {
      expect(showsTrajectory(c)).toBe(!RING_ONLY_CATEGORIES.has(c));
    }
  });
});

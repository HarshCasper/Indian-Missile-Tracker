import type { Category } from '../schema';

/**
 * category.ts — how a system should be drawn on the globe.
 *
 * Engagement-envelope systems (point/area defence and short-range tactical
 * weapons) don't fly to a distant fixed target, so an indicative directional
 * arc into the ocean is misleading. For these we show only the range ring —
 * the reach/engagement envelope. Flight systems (ballistic, cruise, SLBM,
 * tech demonstrators) fly to range and keep their trajectory arc.
 */
export const RING_ONLY_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'surface-to-air',
  'air-to-air',
  'anti-tank',
  'anti-ship',
  'ballistic-missile-defence',
]);

export function showsTrajectory(category: Category): boolean {
  return !RING_ONLY_CATEGORIES.has(category);
}

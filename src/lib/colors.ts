import type { Category, Outcome } from '../schema';

/**
 * colors.ts — two coordinated palettes for the "Declassified Plate" identity.
 *
 *  - OUTCOME_GLOBE: luminous inks for arcs/markers on the DARK globe window.
 *    Successes (≈90% of tests) are a quiet warm bone so they never smear into a
 *    "wall of green"; failures are the one thing that pops (stamp-red).
 *  - OUTCOME_INK: muted versions readable on the light VELLUM chrome (chips/dots).
 *  - CATEGORY_COLORS: a restrained, harmonious categorical set (no neon rainbow),
 *    legible on vellum where the analytics plates live.
 */

/** Arc / marker colors on the dark globe. */
export const OUTCOME_GLOBE: Record<Outcome, string> = {
  success: '#C9BD9E', // quiet warm bone
  partial: '#D89A3C', // amber
  failure: '#D6573F', // luminous stamp-red — the signal that should pop
  unknown: '#7E8794', // slate-grey
};

/** Near-white highlight for the selected test (reticle lock). */
export const SELECTED_GLOBE = '#F2F4EE';

/** Outcome colors for chips/dots on the light vellum chrome. */
export const OUTCOME_INK: Record<Outcome, string> = {
  success: '#6E7A4E', // muted olive
  partial: '#B0712A', // amber
  failure: '#A6402C', // stamp-red
  unknown: '#8A8472', // grey
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  success: 'Success',
  partial: 'Partial',
  failure: 'Failure',
  unknown: 'Unknown',
};

/** Category color — muted, plate-appropriate, distinct on vellum. */
export const CATEGORY_COLORS: Record<Category, string> = {
  'surface-to-surface': '#3E6E78', // teal-ink
  'surface-to-air': '#6E8A52', // moss
  'air-to-air': '#9A6A86', // plum-grey
  'air-to-surface': '#B0712A', // ochre
  'anti-ship': '#3D7E8A', // steel-cyan
  'anti-tank': '#8A7A3E', // olive-brass
  'anti-satellite': '#7A6AA0', // muted violet
  'ballistic-missile-defence': '#C28A3A', // brass
  'submarine-launched': '#2F7E74', // sea-green
  cruise: '#5E7088', // slate-blue (kept clear of stamp-red)
  'technology-demonstrator': '#7C7768', // stone
  other: '#8A8472', // grey
};

/** Human-friendly labels for the controlled-vocabulary slugs. */
const CONNECTORS = new Set(['to', 'and', 'of', 'or', 'the']);
export function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w, i) => (i > 0 && CONNECTORS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Backwards-compatible alias: legacy components import OUTCOME_COLORS. */
export const OUTCOME_COLORS = OUTCOME_GLOBE;

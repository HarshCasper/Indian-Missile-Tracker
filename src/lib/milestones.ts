import type { ResolvedTest } from '../schema';

/**
 * milestones.ts — curated programme milestones for the annotated era rail.
 *
 * Each milestone references a missile_id; its DATE is resolved at runtime from
 * the earliest test of that system in the dataset, so a flag can never drift out
 * of sync with the data it annotates. The label is the short flag text, the
 * blurb the hover-popup body.
 */

export interface MilestoneDef {
  missile_id: string;
  label: string;
  blurb: string;
}

export interface ResolvedMilestone extends MilestoneDef {
  date: string; // ISO, resolved from the earliest matching test
  year: number;
}

const MILESTONES: MilestoneDef[] = [
  {
    missile_id: 'prithvi-i',
    label: 'First Prithvi',
    blurb: "India's first indigenous ballistic missile begins flight testing under the IGMDP.",
  },
  {
    missile_id: 'agni-ii',
    label: 'First Agni flight',
    blurb: 'The Agni line reaches intermediate range — a rail/road-mobile MRBM enters testing.',
  },
  {
    missile_id: 'brahmos',
    label: 'BrahMos',
    blurb: 'First flight of the Indo-Russian supersonic cruise missile — a new strike class.',
  },
  {
    missile_id: 'pad',
    label: 'First BMD intercept',
    blurb: 'Prithvi Air Defence: India demonstrates exo-atmospheric ballistic-missile interception.',
  },
  {
    missile_id: 'k-15',
    label: 'First SLBM',
    blurb: 'K-15 Sagarika — the first submarine-launched ballistic missile, completing the sea leg of the triad.',
  },
  {
    missile_id: 'agni-v',
    label: 'Agni-V (ICBM-class)',
    blurb: 'Agni-V reaches 5,000+ km — India enters the intercontinental-range club.',
  },
  {
    missile_id: 'asat-mission-shakti',
    label: 'Mission Shakti (ASAT)',
    blurb: 'A PDV Mk-II destroys a live satellite — India becomes the 4th nation to demonstrate an ASAT capability.',
  },
  {
    missile_id: 'hstdv',
    label: 'Hypersonic (HSTDV)',
    blurb: 'Scramjet-powered hypersonic flight is demonstrated for ~20+ seconds of autonomous cruise.',
  },
  {
    missile_id: 'agni-prime',
    label: 'Agni-Prime',
    blurb: 'A next-generation, fully canisterised MRBM — lighter, more accurate, faster to deploy.',
  },
  {
    missile_id: 'lrlacm',
    label: 'LRLACM',
    blurb: 'A long-range indigenous land-attack cruise missile — the newest addition to the inventory.',
  },
];

/** Resolve each milestone's date from the earliest test of its system. */
export function resolveMilestones(tests: ResolvedTest[]): ResolvedMilestone[] {
  const earliest = new Map<string, string>();
  for (const t of tests) {
    if (!t.date) continue;
    const cur = earliest.get(t.missile_id);
    if (!cur || t.date < cur) earliest.set(t.missile_id, t.date);
  }
  return MILESTONES.flatMap((m) => {
    const date = earliest.get(m.missile_id);
    if (!date) return [];
    return [{ ...m, date, year: Number(date.slice(0, 4)) }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

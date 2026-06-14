import type { Category, Missile, Outcome, ResolvedTest } from '../schema';
import { OUTCOMES } from '../schema';
import { branchesFor, SERVICE_BRANCHES, type ServiceBranch } from './agency';

/**
 * analytics.ts — pure derivations that feed the numbered plate atlas. No React,
 * no charting lib: each returns plain data the SVG plates render directly.
 */

export interface YearBucket {
  year: number;
  success: number;
  partial: number;
  failure: number;
  unknown: number;
  total: number;
}

export function testsByYear(tests: ResolvedTest[]): YearBucket[] {
  const map = new Map<number, YearBucket>();
  for (const t of tests) {
    if (!t.date) continue;
    const y = Number(t.date.slice(0, 4));
    let b = map.get(y);
    if (!b) { b = { year: y, success: 0, partial: 0, failure: 0, unknown: 0, total: 0 }; map.set(y, b); }
    b[t.outcome] += 1;
    b.total += 1;
  }
  const years = [...map.keys()];
  const min = Math.min(...years), max = Math.max(...years);
  const out: YearBucket[] = [];
  for (let y = min; y <= max; y++) {
    out.push(map.get(y) ?? { year: y, success: 0, partial: 0, failure: 0, unknown: 0, total: 0 });
  }
  return out;
}

export interface Count<T extends string = string> { key: T; count: number; }

export function countBy<T extends string>(tests: ResolvedTest[], pick: (t: ResolvedTest) => T | null): Count<T>[] {
  const map = new Map<T, number>();
  for (const t of tests) {
    const k = pick(t);
    if (k == null) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function byCategory(tests: ResolvedTest[]): Count<Category>[] {
  return countBy(tests, (t) => t.category);
}

export function bySite(tests: ResolvedTest[]): Count[] {
  return countBy(tests, (t) => t.site_name ?? 'Unattributed');
}

export function byService(tests: ResolvedTest[], missileById: Map<string, Missile>): Count<ServiceBranch>[] {
  const map = new Map<ServiceBranch, number>();
  for (const t of tests) {
    const m = missileById.get(t.missile_id);
    for (const b of branchesFor(m?.operators)) map.set(b, (map.get(b) ?? 0) + 1);
  }
  return SERVICE_BRANCHES.map((b) => ({ key: b, count: map.get(b) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface MostTested { missile_id: string; name: string; category: Category; count: number; }

export function mostTested(tests: ResolvedTest[], limit = 12): MostTested[] {
  const map = new Map<string, MostTested>();
  for (const t of tests) {
    let r = map.get(t.missile_id);
    if (!r) { r = { missile_id: t.missile_id, name: t.missile_name, category: t.category, count: 0 }; map.set(t.missile_id, r); }
    r.count += 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export interface Heatmap {
  categories: Category[];
  years: number[];
  /** grid[categoryIndex][yearIndex] = count */
  grid: number[][];
  max: number;
}

export function categoryYearHeat(tests: ResolvedTest[]): Heatmap {
  const cats = byCategory(tests).map((c) => c.key);
  const ys = testsByYear(tests).map((b) => b.year);
  const idxY = new Map(ys.map((y, i) => [y, i]));
  const idxC = new Map(cats.map((c, i) => [c, i]));
  const grid = cats.map(() => ys.map(() => 0));
  let max = 0;
  for (const t of tests) {
    if (!t.date) continue;
    const ci = idxC.get(t.category);
    const yi = idxY.get(Number(t.date.slice(0, 4)));
    if (ci == null || yi == null) continue;
    grid[ci][yi] += 1;
    if (grid[ci][yi] > max) max = grid[ci][yi];
  }
  return { categories: cats, years: ys, grid, max };
}

export interface Reliability {
  missile_id: string; name: string; category: Category;
  success: number; partial: number; failure: number; unknown: number;
  total: number; decided: number; rate: number;
}

/** Wilson score lower bound — a confidence-adjusted success rate that rewards
 *  both a high ratio AND a larger sample, so a 31/31 outranks a 3/3 and the
 *  most-proven systems (which is where the real failures live) surface first. */
function wilsonLB(success: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96, p = success / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}

/**
 * Per-system success/failure split. Rate is success over DECIDED tests
 * (excludes unknown — consistent with the headline success-rate metric), and
 * systems are ranked by the Wilson lower bound so the list isn't swamped by
 * trivial 100%/3-test records.
 */
export function reliability(tests: ResolvedTest[], minTests = 3, limit = 14): Reliability[] {
  const map = new Map<string, Reliability>();
  for (const t of tests) {
    let r = map.get(t.missile_id);
    if (!r) { r = { missile_id: t.missile_id, name: t.missile_name, category: t.category, success: 0, partial: 0, failure: 0, unknown: 0, total: 0, decided: 0, rate: 0 }; map.set(t.missile_id, r); }
    r[t.outcome] += 1;
    r.total += 1;
  }
  return [...map.values()]
    .map((r) => {
      const decided = r.success + r.partial + r.failure;
      return { ...r, decided, rate: decided ? r.success / decided : 0 };
    })
    .filter((r) => r.decided >= minTests)
    .sort((a, b) => wilsonLB(b.success, b.decided) - wilsonLB(a.success, a.decided) || b.decided - a.decided)
    .slice(0, limit);
}

export function outcomeCounts(tests: ResolvedTest[]): Record<Outcome, number> {
  const r = { success: 0, partial: 0, failure: 0, unknown: 0 } as Record<Outcome, number>;
  for (const t of tests) r[t.outcome] += 1;
  return r;
}

export interface RangeRow { id: string; name: string; category: Category; nuclear: boolean; maxRange: number; }

/** Systems plotted by demonstrated max range (ATGM → ICBM) — the reach spectrum. */
export function rangeSpectrum(missiles: Missile[]): RangeRow[] {
  return missiles
    .map((m) => {
      const max = m.range_km?.max ?? m.range_km?.min ?? null;
      return max == null ? null : { id: m.id, name: m.name, category: m.category, nuclear: m.nuclear_capable, maxRange: max };
    })
    .filter((r): r is RangeRow => r != null)
    .sort((a, b) => b.maxRange - a.maxRange);
}

export interface Headline {
  tests: number;
  systems: number;
  facilities: number;
  spanFrom: number;
  spanTo: number;
  peakYear: number;
  peakCount: number;
  successRate: number; // 0..1
  nuclearSystems: number;
}

export function headline(tests: ResolvedTest[], missiles: Missile[], facilities: number): Headline {
  const years = testsByYear(tests);
  const peak = years.reduce((a, b) => (b.total > a.total ? b : a), years[0] ?? { year: 0, total: 0 } as YearBucket);
  const oc = outcomeCounts(tests);
  const decided = oc.success + oc.partial + oc.failure;
  return {
    tests: tests.length,
    systems: missiles.length,
    facilities,
    spanFrom: years[0]?.year ?? 0,
    spanTo: years[years.length - 1]?.year ?? 0,
    peakYear: peak.year,
    peakCount: peak.total,
    successRate: decided ? oc.success / decided : 0,
    nuclearSystems: missiles.filter((m) => m.nuclear_capable).length,
  };
}

export const ALL_OUTCOMES = OUTCOMES;

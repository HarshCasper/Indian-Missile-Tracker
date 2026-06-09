import type { DataBundle, Facility, Missile, ResolvedTest } from './schema';

/**
 * dataStore.ts — loads the compiled public/data.json and builds the in-memory
 * indexes the UI reads from. The detail drawer rolls a selected test up to its
 * missile and launch facility via these maps.
 */

export interface LoadedData {
  bundle: DataBundle;
  missileById: Map<string, Missile>;
  facilityById: Map<string, Facility>;
  testById: Map<string, ResolvedTest>;
  /** Inclusive [min, max] of all known test dates, for the date-range slider. */
  dateExtent: [string, string];
}

export async function loadData(): Promise<LoadedData> {
  // BASE_URL keeps the fetch correct under a GitHub Pages sub-path.
  const res = await fetch(`${import.meta.env.BASE_URL}data.json`);
  if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
  const bundle = (await res.json()) as DataBundle;

  const dates = bundle.tests.map((t) => t.date).filter((d): d is string => !!d).sort();

  return {
    bundle,
    missileById: new Map(bundle.missiles.map((m) => [m.id, m])),
    facilityById: new Map(bundle.facilities.map((f) => [f.id, f])),
    testById: new Map(bundle.tests.map((t) => [t.id, t])),
    dateExtent: [dates[0] ?? '1980-01-01', dates[dates.length - 1] ?? '2026-12-31'],
  };
}

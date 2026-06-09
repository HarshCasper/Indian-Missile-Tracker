import type {
  Category,
  Outcome,
  RangeBand,
  ResolvedTest,
  Status,
} from '../schema';

/**
 * filters.ts — the shared filter state and the single pure function that turns
 * it into the set of visible tests. Kept pure and dependency-free so the globe,
 * sidebar, and drawer all agree on what is shown, and so it can be unit-tested.
 *
 * Convention: an empty set for a facet means "no filter" (show all). A facet
 * with entries keeps only tests whose value is in the set.
 */

export interface Filters {
  categories: Set<Category>;
  outcomes: Set<Outcome>;
  facilities: Set<string>; // site_id
  missiles: Set<string>; // missile_id
  statuses: Set<Status>;
  rangeBands: Set<RangeBand>;
  nuclearOnly: boolean;
  /** Inclusive ISO date bounds from the timeline brush. */
  dateFrom: string;
  dateTo: string;
}

export interface LayerToggles {
  arcs: boolean;
  rings: boolean;
  markers: boolean;
}

export function emptyFilters(dateFrom: string, dateTo: string): Filters {
  return {
    categories: new Set(),
    outcomes: new Set(),
    facilities: new Set(),
    missiles: new Set(),
    statuses: new Set(),
    rangeBands: new Set(),
    nuclearOnly: false,
    dateFrom,
    dateTo,
  };
}

/** Toggle membership of `value` in a Set facet, returning a new Set. */
export function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** The one place that decides whether a test passes the active filters. */
export function selectVisibleTests(tests: ResolvedTest[], f: Filters): ResolvedTest[] {
  return tests.filter((t) => {
    if (f.categories.size && !f.categories.has(t.category)) return false;
    if (f.outcomes.size && !f.outcomes.has(t.outcome)) return false;
    if (f.facilities.size && (t.site_id === null || !f.facilities.has(t.site_id))) return false;
    if (f.missiles.size && !f.missiles.has(t.missile_id)) return false;
    if (f.statuses.size && !f.statuses.has(t.status)) return false;
    if (f.rangeBands.size && (t.range_band === null || !f.rangeBands.has(t.range_band))) return false;
    if (f.nuclearOnly && !t.nuclear_capable) return false;
    // Date filter: tests with an unknown date (null) are always kept.
    if (t.date) {
      if (f.dateFrom && t.date < f.dateFrom) return false;
      if (f.dateTo && t.date > f.dateTo) return false;
    }
    return true;
  });
}

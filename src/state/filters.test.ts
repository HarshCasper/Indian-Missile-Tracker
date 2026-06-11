import { describe, expect, it } from 'vitest';
import { emptyFilters, selectVisibleTests, toggleInSet } from './filters';
import type { ResolvedTest } from '../schema';

function mkTest(over: Partial<ResolvedTest>): ResolvedTest {
  return {
    id: 't',
    missile_id: 'm',
    date: '2020-01-01',
    date_precision: 'day',
    site_id: 'abdul-kalam-island',
    outcome: 'success',
    claims: [],
    sources: [],
    confidence: 'reported',
    missile_name: 'M',
    category: 'surface-to-surface',
    status: 'operational',
    nuclear_capable: false,
    range_band: 'medium',
    site_name: 'AKI',
    site_lat: 20,
    site_lon: 87,
    dest_lat: 10,
    dest_lon: 90,
    indicative: true,
    needs_primary_source: false,
    ...over,
  };
}

describe('selectVisibleTests', () => {
  const tests = [
    mkTest({ id: 'a', category: 'surface-to-surface', outcome: 'success', nuclear_capable: true, range_band: 'intercontinental', date: '2012-04-19' }),
    mkTest({ id: 'b', category: 'cruise', outcome: 'failure', nuclear_capable: false, range_band: 'short', date: '2001-06-12', site_id: 'itr-chandipur' }),
    mkTest({ id: 'c', category: 'anti-satellite', outcome: 'success', date: null, range_band: null, site_id: null }),
  ];

  it('returns everything when no facet is active', () => {
    const f = emptyFilters('', '');
    expect(selectVisibleTests(tests, f).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by category', () => {
    const f = { ...emptyFilters('', ''), categories: new Set(['cruise' as const]) };
    expect(selectVisibleTests(tests, f).map((t) => t.id)).toEqual(['b']);
  });

  it('composes multiple facets (AND across facets)', () => {
    const f = {
      ...emptyFilters('', ''),
      outcomes: new Set(['success' as const]),
      nuclearOnly: true,
    };
    expect(selectVisibleTests(tests, f).map((t) => t.id)).toEqual(['a']);
  });

  it('keeps unknown-date tests but bounds known dates', () => {
    const f = { ...emptyFilters('2010-01-01', '2015-01-01') };
    // 'a' (2012) in range, 'b' (2001) out, 'c' (null date) kept.
    expect(selectVisibleTests(tests, f).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('excludes tests with no site when a facility facet is set', () => {
    const f = { ...emptyFilters('', ''), facilities: new Set(['itr-chandipur']) };
    expect(selectVisibleTests(tests, f).map((t) => t.id)).toEqual(['b']);
  });
});

describe('toggleInSet', () => {
  it('adds then removes immutably', () => {
    const a = new Set<string>();
    const b = toggleInSet(a, 'x');
    expect([...b]).toEqual(['x']);
    expect([...a]).toEqual([]); // original untouched
    const c = toggleInSet(b, 'x');
    expect([...c]).toEqual([]);
  });
});

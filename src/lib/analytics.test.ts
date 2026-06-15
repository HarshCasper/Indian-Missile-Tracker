import { describe, it, expect } from 'vitest';
import { reliability } from './analytics';
import type { ResolvedTest, Outcome } from '../schema';

const mk = (missile_id: string, name: string, outcome: Outcome): ResolvedTest =>
  ({ id: `${missile_id}-${outcome}`, missile_id, missile_name: name, category: 'surface-to-surface', outcome } as unknown as ResolvedTest);
const rep = (n: number, missile_id: string, name: string, outcome: Outcome) =>
  Array.from({ length: n }, () => mk(missile_id, name, outcome));

describe('reliability', () => {
  const tests: ResolvedTest[] = [
    ...rep(12, 'A', 'Sys A', 'success'),                                  // 12/12 perfect, high volume
    ...rep(3, 'B', 'Sys B', 'success'),                                   // 3/3 perfect, tiny
    ...rep(16, 'C', 'Sys C', 'success'), ...rep(4, 'C', 'Sys C', 'failure'), // 16/20 = 80%
    ...rep(2, 'D', 'Sys D', 'success'),                                   // only 2 decided → excluded
    ...rep(5, 'E', 'Sys E', 'success'), mk('E', 'Sys E', 'unknown'),      // 5 decided + 1 unknown
  ];
  const rel = reliability(tests);
  const idx = (m: string) => rel.findIndex((r) => r.missile_id === m);

  it('excludes systems below the decided-test threshold', () => {
    expect(rel.some((r) => r.missile_id === 'D')).toBe(false);
  });

  it('computes rate over decided tests (unknown excluded from denominator)', () => {
    const E = rel.find((r) => r.missile_id === 'E')!;
    expect(E.rate).toBe(1);
    expect(E.decided).toBe(5);
    expect(E.total).toBe(6);
  });

  it('reports the success/failure split', () => {
    const C = rel.find((r) => r.missile_id === 'C')!;
    expect(C.success).toBe(16);
    expect(C.failure).toBe(4);
    expect(C.rate).toBeCloseTo(0.8);
  });

  it('ranks the most-proven system first (Wilson, not raw ratio)', () => {
    expect(rel[0].missile_id).toBe('A'); // 12/12 outranks 3/3
  });

  it('surfaces failure-bearing high-volume systems above trivial perfect records', () => {
    expect(idx('C')).toBeLessThan(idx('B')); // 16/20 ranks above 3/3 → splits are visible
  });
});

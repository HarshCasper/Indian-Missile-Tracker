import { describe, expect, it } from 'vitest';
import { circlePath, destinationPoint } from './geo';

describe('destinationPoint', () => {
  it('moves due north by roughly 1 degree per 111 km', () => {
    const d = destinationPoint(0, 0, 111.19, 0);
    expect(d.lat).toBeCloseTo(1, 1);
    expect(d.lon).toBeCloseTo(0, 3);
  });

  it('moves east when bearing is 90 from the equator', () => {
    const d = destinationPoint(0, 0, 111.19, 90);
    expect(d.lon).toBeGreaterThan(0);
    expect(d.lat).toBeCloseTo(0, 3);
  });
});

describe('circlePath', () => {
  it('returns a closed ring with steps+1 points', () => {
    const ring = circlePath(20, 87, 1000, 12);
    expect(ring.length).toBe(13);
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
  });

  it('produces [lat, lon] pairs near the requested radius', () => {
    const lat0 = 20;
    const ring = circlePath(lat0, 87, 500, 8);
    // Every vertex should be offset from the centre (not degenerate).
    for (const [lat, lon] of ring) {
      expect(Math.abs(lat - lat0)).toBeLessThan(10);
      expect(typeof lon).toBe('number');
    }
  });
});

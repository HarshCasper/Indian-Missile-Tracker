import destination from '@turf/destination';
import circle from '@turf/circle';
import { point } from '@turf/helpers';

/**
 * Geodesy helpers shared by scripts/build-data.ts (Node) and the globe (browser).
 * Kept free of React / DOM so both runtimes can import it.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Great-circle destination: travel `distanceKm` from (lat, lon) along `bearingDeg`
 * (degrees clockwise from north). Used to place a test's impact/endpoint when a
 * real coordinate isn't published.
 */
export function destinationPoint(lat: number, lon: number, distanceKm: number, bearingDeg: number): LatLon {
  const dest = destination(point([lon, lat]), distanceKm, bearingDeg, { units: 'kilometers' });
  const [destLon, destLat] = dest.geometry.coordinates;
  return { lat: destLat, lon: destLon };
}

/**
 * A closed ring of [lat, lon] points approximating a geodesic circle of
 * `radiusKm` around (lat, lon). Rendered as a globe `path` to show a missile's
 * operational reach from its launch facility.
 */
export function circlePath(lat: number, lon: number, radiusKm: number, steps = 72): Array<[number, number]> {
  const poly = circle(point([lon, lat]), radiusKm, { steps, units: 'kilometers' });
  // GeoJSON polygon: coordinates[0] is the outer ring as [lon, lat] pairs.
  return poly.geometry.coordinates[0].map(([lng, lt]) => [lt, lng] as [number, number]);
}

/**
 * A GeoJSON polygon feature for a geodesic disc of `radiusKm` around (lat, lon),
 * tagged `__ring` so the globe can render it as the soft range-coverage fill +
 * stroked edge in the same polygons layer as the country borders.
 */
export function circleFeature(lat: number, lon: number, radiusKm: number, color = '#4FD2C2', steps = 96) {
  const poly = circle(point([lon, lat]), radiusKm, { steps, units: 'kilometers' });
  poly.properties = { __ring: true, color };
  return poly;
}

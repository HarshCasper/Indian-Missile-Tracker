/**
 * globeStyles.ts — four genuinely distinct base-maps for the globe window.
 *
 *   ink       — document-native: solid dark-ocean material + fine ink coastlines
 *               drawn from country polygons. No photo texture. The default.
 *   relief     — greyscale shaded relief (embossed monochrome terrain).
 *   satellite  — daytime blue-marble photographic imagery.
 *   night      — city-lights dark marble.
 *
 * The old build shipped "political" and "topographic" that rendered identically;
 * these four are visually unmistakable from one another.
 */

export type GlobeStyleId = 'ink' | 'relief' | 'satellite' | 'night';

export interface GlobeStyle {
  id: GlobeStyleId;
  label: string;
  /** three-globe surface texture, or null for a flat solid material (ink). */
  globeImageUrl: string | null;
  bumpImageUrl?: string;
  backgroundImageUrl?: string;
  /** Solid globe material color used when there is no texture. */
  globeColor?: string;
  /** Whether to draw country-border polygons over the globe. */
  borders: boolean;
  borderColor: string;
  /** Faint land fill for the ink outline look. */
  landColor: string;
  atmosphereColor: string;
  blurb: string;
}

const CDN = '//unpkg.com/three-globe/example/img';

export const GLOBE_STYLES: Record<GlobeStyleId, GlobeStyle> = {
  ink: {
    id: 'ink',
    label: 'Ink',
    // A 2×2 solid dark-ocean texture: keeps the flat ink look while ensuring the
    // globe sphere always has a loaded material (the html/label occlusion math in
    // three-globe needs a ready globe, else it throws on a null image).
    globeImageUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3Crect width='2' height='2' fill='%230A1119'/%3E%3C/svg%3E",
    globeColor: '#0A1119',
    borders: true,
    borderColor: 'rgba(201, 189, 158, 0.32)',
    landColor: 'rgba(120, 150, 175, 0.05)',
    atmosphereColor: '#2b4a63',
    blurb: 'Dark ocean + fine ink coastlines',
  },
  relief: {
    id: 'relief',
    label: 'Relief',
    globeImageUrl: `${CDN}/earth-topology.png`,
    bumpImageUrl: `${CDN}/earth-topology.png`,
    borders: true,
    borderColor: 'rgba(20, 18, 14, 0.45)',
    landColor: 'rgba(0,0,0,0)',
    atmosphereColor: '#3a3a40',
    blurb: 'Greyscale shaded relief',
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    globeImageUrl: `${CDN}/earth-blue-marble.jpg`,
    bumpImageUrl: `${CDN}/earth-topology.png`,
    backgroundImageUrl: `${CDN}/night-sky.png`,
    borders: false,
    borderColor: 'rgba(255,255,255,0.3)',
    landColor: 'rgba(0,0,0,0)',
    atmosphereColor: '#7fb2e5',
    blurb: 'Daytime blue-marble imagery',
  },
  night: {
    id: 'night',
    label: 'Night',
    globeImageUrl: `${CDN}/earth-night.jpg`,
    bumpImageUrl: `${CDN}/earth-topology.png`,
    backgroundImageUrl: `${CDN}/night-sky.png`,
    borders: false,
    borderColor: 'rgba(255,255,255,0.25)',
    landColor: 'rgba(0,0,0,0)',
    atmosphereColor: '#3a6ea5',
    blurb: 'City-lights dark marble',
  },
};

export const GLOBE_STYLE_ORDER: GlobeStyleId[] = ['ink', 'relief', 'satellite', 'night'];

/** Natural-Earth 110m country polygons used for the coastline/border overlay. */
export const COUNTRIES_GEOJSON_URL =
  'https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson';

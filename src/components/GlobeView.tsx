import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import type { Facility, ResolvedTest } from '../schema';
import { OUTCOME_GLOBE, SELECTED_GLOBE } from '../lib/colors';
import { circlePath, circleFeature } from '../lib/geo';
import { GLOBE_STYLES, GLOBE_STYLE_ORDER, COUNTRIES_GEOJSON_URL, type GlobeStyleId } from '../lib/globeStyles';
import { ReticleMark } from './ReticleMark';

export interface SiteMarker { facility: Facility; count: number; }
export interface RingSpec { lat: number; lon: number; radiusKm: number; color: string; hypothetical: boolean; label: string; }
export interface CameraTarget { lat: number; lng: number; altitude: number; }

interface Props {
  baseStyle: GlobeStyleId;
  onBaseStyle: (s: GlobeStyleId) => void;
  sites: SiteMarker[];
  focusedSiteId: string | null;
  arcs: ResolvedTest[];
  selectedTestId: string | null;
  rings: RingSpec[];
  pin: { lat: number; lon: number } | null;
  cameraTarget: CameraTarget | null;
  cameraNonce: number;
  relocateMode: boolean;
  coldOpen: boolean;
  onSelectTest: (t: ResolvedTest) => void;
  onSelectSite: (f: Facility) => void;
  onGlobeClick: (lat: number, lng: number) => void;
}

interface PointDatum { kind: 'site' | 'pin'; lat: number; lng: number; color: string; radius: number; alt: number; label: string; facility?: Facility; }
interface LabelDatum { kind: 'site' | 'test'; lat: number; lng: number; text: string; color: string; size: number; facility?: Facility; test?: ResolvedTest; }

const INDIA_POV: CameraTarget = { lat: 13, lng: 82, altitude: 2.4 };
const BONE = '#E8DFC8';

/** Punchy site labels so the close-packed east-coast ranges don't overlap. */
function siteShort(name: string): string {
  if (/Kalam|Wheeler/i.test(name)) return 'Kalam Is.';
  if (/Chandipur|\bITR\b/i.test(name)) return 'ITR Chandipur';
  if (/Visakha/i.test(name)) return 'Visakhapatnam';
  if (/Pokhran/i.test(name)) return 'Pokhran';
  if (/Sriharikota|Dhawan|SHAR/i.test(name)) return 'Sriharikota';
  return name.replace(/\s*\(.+?\)/, '');
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function GlobeView({
  baseStyle, onBaseStyle, sites, focusedSiteId, arcs, selectedTestId, rings, pin,
  cameraTarget, cameraNonce, relocateMode, coldOpen, onSelectTest, onSelectSite, onGlobeClick,
}: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [countries, setCountries] = useState<{ features: object[] }>({ features: [] });
  const coordRef = useRef<HTMLSpanElement>(null);

  const style = GLOBE_STYLES[baseStyle];

  useEffect(() => {
    if (!style.borders || countries.features.length) return;
    let alive = true;
    fetch(COUNTRIES_GEOJSON_URL).then((r) => r.json()).then((g) => alive && setCountries(g)).catch(() => {});
    return () => { alive = false; };
  }, [style.borders, countries.features.length]);

  // Country coastlines (ink/relief) + a soft coverage disc per ring. With many
  // rings (playback) we draw outlines only — overlapping coplanar discs z-fight.
  const polygons = useMemo(() => {
    const base = style.borders ? countries.features : [];
    const discRings = rings.length <= 3 ? rings : [];
    return [...base, ...discRings.map((r) => circleFeature(r.lat, r.lon, r.radiusKm, r.color))];
  }, [style.borders, countries.features, rings]);

  const ringPaths = useMemo(
    () => rings.map((r) => ({ coords: circlePath(r.lat, r.lon, r.radiusKm, 128), color: r.color, label: r.label })),
    [rings],
  );

  // Site dots (always) + the reach pin.
  const points = useMemo<PointDatum[]>(() => {
    const list: PointDatum[] = sites.map((s) => ({
      kind: 'site', lat: s.facility.lat, lng: s.facility.lon, facility: s.facility,
      color: s.facility.id === focusedSiteId ? '#4FD2C2' : BONE,
      radius: 0.3 + Math.sqrt(s.count) * 0.05, alt: 0.012,
      label: `${s.facility.name} — ${s.count} tests`,
    }));
    if (pin) list.push({ kind: 'pin', lat: pin.lat, lng: pin.lon, color: '#E0A93F', radius: 0.7, alt: 0.05, label: 'Hypothetical reach point' });
    return list;
  }, [sites, focusedSiteId, pin]);

  // While relocating, hide the arcs so any globe click lands as a placement
  // (otherwise an arc under the cursor swallows the click and selects a test).
  const liveArcs = useMemo(() => (relocateMode ? [] : arcs), [relocateMode, arcs]);
  // Per-arc index → fan co-located arcs out by altitude so N tests don't overplot into one line.
  const arcIndex = useMemo(() => new Map(liveArcs.map((t, i) => [t.id, i])), [liveArcs]);
  const reduceMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Labels: site names at cold open; test labels when a focus is small enough.
  const labels = useMemo<LabelDatum[]>(() => {
    if (coldOpen) {
      return sites.map((s) => ({ kind: 'site', lat: s.facility.lat, lng: s.facility.lon, text: siteShort(s.facility.name), color: 'rgba(232,223,200,0.92)', size: 0.72, facility: s.facility }));
    }
    // Per-test labels only when the focused set is sparse — many tests from one
    // system share a launch corridor and would pile up. Always label the selected flight.
    const labeled = liveArcs.length <= 8 ? liveArcs : liveArcs.filter((t) => t.id === selectedTestId);
    return labeled.map((t) => ({
      kind: 'test', lat: t.dest_lat as number, lng: t.dest_lon as number,
      text: `${t.missile_name}${t.date ? ' ' + t.date.slice(0, 4) : ''}`,
      color: t.id === selectedTestId ? SELECTED_GLOBE : 'rgba(201,189,158,0.82)', size: 0.6, test: t,
    }));
  }, [coldOpen, sites, liveArcs, selectedTestId]);

  useEffect(() => { globeRef.current?.pointOfView(INDIA_POV, 0); }, []);
  useEffect(() => {
    if (cameraTarget) globeRef.current?.pointOfView(cameraTarget, 820);
  }, [cameraNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const writeCoords = (pov?: { lat: number; lng: number; altitude: number }) => {
    const p = pov ?? globeRef.current?.pointOfView();
    if (p && coordRef.current) {
      const ns = p.lat >= 0 ? 'N' : 'S', ew = p.lng >= 0 ? 'E' : 'W';
      coordRef.current.textContent =
        `${Math.abs(p.lat).toFixed(2)}°${ns}  ${Math.abs(p.lng).toFixed(2)}°${ew}  ALT ${p.altitude.toFixed(2)}`;
    }
  };
  useEffect(() => { const t = setTimeout(() => writeCoords(), 80); return () => clearTimeout(t); }, []);

  const nudge = (dAlt = 0, dLat = 0) => {
    const g = globeRef.current; if (!g) return;
    const p = g.pointOfView();
    g.pointOfView({
      lat: Math.max(-85, Math.min(85, p.lat + dLat)), lng: p.lng,
      altitude: Math.max(0.35, Math.min(5, p.altitude + dAlt)),
    }, 350);
  };

  return (
    <div ref={containerRef} className={`globe-container${relocateMode ? ' is-relocate' : ''}`}>
      <Globe
        ref={globeRef}
        width={size.width || undefined}
        height={size.height || undefined}
        globeImageUrl={style.globeImageUrl ?? undefined}
        bumpImageUrl={style.bumpImageUrl}
        backgroundImageUrl={style.backgroundImageUrl}
        backgroundColor="#0B0F16"
        showGlobe
        showAtmosphere
        atmosphereColor={style.atmosphereColor}
        atmosphereAltitude={0.18}
        onZoom={(pov) => writeCoords(pov)}
        onGlobeClick={({ lat, lng }) => onGlobeClick(lat, lng)}
        // --- polygons: coastlines + range-coverage disc ---
        polygonsData={polygons}
        polygonCapColor={(f: object) => {
          const p = (f as { properties?: { __ring?: boolean; color?: string } }).properties;
          return p?.__ring ? hexToRgba(p.color ?? '#4FD2C2', 0.13) : style.landColor;
        }}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={(f: object) => {
          const p = (f as { properties?: { __ring?: boolean; color?: string } }).properties;
          return p?.__ring ? hexToRgba(p.color ?? '#4FD2C2', 0.5) : style.borderColor;
        }}
        polygonAltitude={(f: object) =>
          (f as { properties?: { __ring?: boolean } }).properties?.__ring ? 0.009 : 0.006}
        polygonsTransitionDuration={0}
        // --- range-ring outline (dashed) ---
        pathsData={ringPaths}
        pathPoints={(d: object) => (d as { coords: Array<[number, number]> }).coords}
        pathPointLat={(p) => (p as [number, number])[0]}
        pathPointLng={(p) => (p as [number, number])[1]}
        pathColor={(d: object) => (d as { color: string }).color}
        pathLabel={(d: object) => (d as { label?: string }).label ?? ''}
        pathStroke={1.7}
        pathDashLength={0.035}
        pathDashGap={0.02}
        pathTransitionDuration={0}
        // --- trajectory arcs (dashed = indicative direction) ---
        arcsData={liveArcs}
        arcStartLat={(d) => (d as ResolvedTest).site_lat as number}
        arcStartLng={(d) => (d as ResolvedTest).site_lon as number}
        arcEndLat={(d) => (d as ResolvedTest).dest_lat as number}
        arcEndLng={(d) => (d as ResolvedTest).dest_lon as number}
        arcColor={(d: object) => {
          const t = d as ResolvedTest;
          return t.id === selectedTestId ? SELECTED_GLOBE : OUTCOME_GLOBE[t.outcome];
        }}
        arcStroke={(d) => ((d as ResolvedTest).id === selectedTestId ? 1.6 : 0.65)}
        arcAltitude={(d) => 0.16 + ((arcIndex.get((d as ResolvedTest).id) ?? 0) % 9) * 0.05}
        arcDashLength={0.45}
        arcDashGap={0.12}
        arcDashAnimateTime={reduceMotion ? 0 : 3000}
        arcLabel={(d) => {
          const t = d as ResolvedTest;
          return `<b>${t.missile_name}</b> · ${t.outcome.toUpperCase()}<br/>${t.date ?? 'date unknown'} · indicative direction`;
        }}
        arcsTransitionDuration={0}
        onArcClick={(d) => onSelectTest(d as ResolvedTest)}
        // --- site dots + reach ghost ---
        pointsData={points}
        pointLat={(d) => (d as PointDatum).lat}
        pointLng={(d) => (d as PointDatum).lng}
        pointColor={(d) => (d as PointDatum).color}
        pointRadius={(d) => (d as PointDatum).radius}
        pointAltitude={(d) => (d as PointDatum).alt}
        pointResolution={14}
        pointLabel={(d) => (d as PointDatum).label}
        pointsTransitionDuration={0}
        onPointClick={(d) => { if (relocateMode) return; const p = d as PointDatum; if (p.kind === 'site' && p.facility) onSelectSite(p.facility); }}
        // --- labels: site names (cold open) / test labels (focus) ---
        labelsData={labels}
        labelLat={(d) => (d as LabelDatum).lat}
        labelLng={(d) => (d as LabelDatum).lng}
        labelText={(d) => (d as LabelDatum).text}
        labelColor={(d) => (d as LabelDatum).color}
        labelSize={(d) => (d as LabelDatum).size}
        labelDotRadius={(d) => ((d as LabelDatum).kind === 'site' ? 0 : 0.16)}
        labelResolution={2}
        labelAltitude={0.013}
        onLabelClick={(d) => {
          const l = d as LabelDatum;
          if (l.kind === 'site' && l.facility) onSelectSite(l.facility);
          else if (l.test) onSelectTest(l.test);
        }}
      />

      <div className="stage-coords mono"><span className="sc-tag">CAM</span> <span ref={coordRef}>—</span></div>

      {relocateMode && (
        <div className="stage-reticle" aria-hidden="true">
          <ReticleMark size={132} spokes={24} spin period={28} />
          <span className="sr-hint">Tap or click the globe to place the reach point</span>
        </div>
      )}
      {selectedTestId && (
        <div key={selectedTestId} className="stage-lock" aria-hidden="true"><ReticleMark size={96} spokes={16} /></div>
      )}

      <div className="basemap-picker" role="radiogroup" aria-label="Base map">
        {GLOBE_STYLE_ORDER.map((id) => (
          <button key={id} role="radio" aria-checked={baseStyle === id}
            className={`bm-chip${baseStyle === id ? ' is-active' : ''}`}
            title={GLOBE_STYLES[id].blurb} onClick={() => onBaseStyle(id)}>
            {GLOBE_STYLES[id].label}
          </button>
        ))}
      </div>

      <div className="cam-controls" aria-label="Camera">
        <button className="cam-btn" title="Zoom in" onClick={() => nudge(-0.4, 0)}>+</button>
        <button className="cam-btn" title="Zoom out" onClick={() => nudge(0.4, 0)}>−</button>
        <span className="cam-sep" />
        <button className="cam-btn" title="Tilt up" onClick={() => nudge(0, 8)}>▲</button>
        <button className="cam-btn" title="Tilt down" onClick={() => nudge(0, -8)}>▼</button>
        <span className="cam-sep" />
        <button className="cam-btn" title="Reset view" onClick={() => globeRef.current?.pointOfView(INDIA_POV, 700)}>⌂</button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedData } from '../dataStore';
import type { ResolvedTest } from '../schema';
import { GLOBE_STYLES, type GlobeStyleId } from '../lib/globeStyles';
import { NO_FOCUS, type Focus } from '../state/focus';
import { showsTrajectory } from '../lib/category';
import { GlobeView, type CameraTarget, type RingSpec, type SiteMarker } from '../components/GlobeView';
import { SystemRail } from '../components/SystemRail';
import { DossierCard } from '../components/DossierCard';
import { TimelineRail } from '../components/TimelineRail';

const yearOf = (iso: string) => Number(iso.slice(0, 4));
const STYLE_KEY = 'imt.globeStyle';
const RING_TEAL = '#4FD2C2';
const RING_AMBER = '#E0A93F';

function loadStyle(): GlobeStyleId {
  const v = (typeof localStorage !== 'undefined' && localStorage.getItem(STYLE_KEY)) as GlobeStyleId | null;
  return v && v in GLOBE_STYLES ? v : 'ink';
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

interface Props {
  data: LoadedData;
  focus: Focus;
  onFocus: (f: Focus) => void;
}

export function MapView({ data, focus, onFocus }: Props) {
  const { bundle, missileById, testById, facilityById } = data;
  const spanFrom = yearOf(data.dateExtent[0]);
  const spanTo = yearOf(data.dateExtent[1]);

  const [baseStyle, setBaseStyle] = useState<GlobeStyleId>(loadStyle);
  const [yearRange, setYearRange] = useState<[number, number]>([spanFrom, spanTo]);
  const [playing, setPlaying] = useState(false);
  const [playYear, setPlayYear] = useState<number | null>(null);
  const [reachAt, setReachAt] = useState<{ lat: number; lon: number } | null>(null);
  const [relocateMode, setRelocateMode] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [railOpen, setRailOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 1024);
  const [camera, setCamera] = useState<{ target: CameraTarget | null; nonce: number }>({ target: null, nonce: 0 });
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { try { localStorage.setItem(STYLE_KEY, baseStyle); } catch { /* ignore */ } }, [baseStyle]);

  // Per-site test counts and the always-on site markers.
  const sites = useMemo<SiteMarker[]>(() => {
    const counts = new Map<string, number>();
    for (const t of bundle.tests) if (t.site_id) counts.set(t.site_id, (counts.get(t.site_id) ?? 0) + 1);
    return bundle.facilities.map((f) => ({ facility: f, count: counts.get(f.id) ?? 0 }));
  }, [bundle]);

  // Precomputed range ring per missile (site + radius), keyed for fast lookup.
  const ringByMissile = useMemo(() => {
    const m = new Map<string, { lat: number; lon: number; radiusKm: number }>();
    for (const r of bundle.rings) m.set(r.missile_id, { lat: r.site_lat, lon: r.site_lon, radiusKm: r.radius_km });
    return m;
  }, [bundle.rings]);

  // Resolve the focus into concrete entities.
  const focusedTest = focus.kind === 'test' ? testById.get(focus.testId) ?? null : null;
  const focusMissileId =
    focus.kind === 'missile' ? focus.missileId : focus.kind === 'test' ? focusedTest?.missile_id ?? null : null;
  const focusedMissile = focusMissileId ? missileById.get(focusMissileId) ?? null : null;
  const focusedSiteId =
    focus.kind === 'site' ? focus.siteId : focus.kind === 'test' ? focusedTest?.site_id ?? null : null;
  const focusedSite = focusedSiteId ? facilityById.get(focusedSiteId) ?? null : null;

  // Reset relocate state whenever the focus changes.
  useEffect(() => { setReachAt(null); setRelocateMode(false); }, [focus]);

  // Focus-based arcs (year-range filtered). Playback + reach are resolved below.
  const arcs = useMemo<ResolvedTest[]>(() => {
    const inWindow = (t: ResolvedTest) =>
      !t.date || (yearOf(t.date) >= yearRange[0] && yearOf(t.date) <= yearRange[1]);
    const drawable = (t: ResolvedTest) => t.site_lat != null && t.dest_lat != null;
    if (focus.kind === 'none') return [];
    if (focus.kind === 'test') return focusedTest && drawable(focusedTest) ? [focusedTest] : [];
    if (focus.kind === 'site')
      return bundle.tests.filter((t) => t.site_id === focus.siteId && drawable(t) && inWindow(t));
    return bundle.tests.filter((t) => t.missile_id === focus.missileId && drawable(t) && inWindow(t));
  }, [focus, focusedTest, bundle.tests, yearRange]);

  const ringBase = focusMissileId ? ringByMissile.get(focusMissileId) ?? null : null;
  const focusedCategory = focusedMissile?.category ?? null;
  const ringAlt = (km: number) => Math.max(1.7, Math.min(3.8, 1.15 + km / 3200));

  const focusRing = useMemo<RingSpec | null>(() => {
    if (!ringBase || !focusedMissile) return null;
    return { lat: ringBase.lat, lon: ringBase.lon, radiusKm: ringBase.radiusKm, color: RING_TEAL,
      hypothetical: false, label: `${focusedMissile.name} reach ~${ringBase.radiusKm.toLocaleString()} km` };
  }, [ringBase, focusedMissile]);

  const hypoRing = useMemo<RingSpec | null>(() => {
    if (!reachAt || !ringBase || !focusedMissile) return null;
    return { lat: reachAt.lat, lon: reachAt.lon, radiusKm: ringBase.radiusKm, color: RING_AMBER,
      hypothetical: true, label: `${focusedMissile.name} hypothetical reach ~${ringBase.radiusKm.toLocaleString()} km` };
  }, [reachAt, ringBase, focusedMissile]);

  // --- Playback: cumulatively materialise the programme up to playYear ---
  // `inPlayback` covers both the live sweep and the frozen end-tableau, so the
  // full picture stays on screen after the sweep finishes until the user clears it.
  const inPlayback = playYear != null;

  const playFlightArcs = useMemo<ResolvedTest[]>(() => {
    if (playYear == null) return [];
    return bundle.tests.filter(
      (t) => t.date != null && yearOf(t.date) <= playYear && t.site_lat != null && t.dest_lat != null && showsTrajectory(t.category),
    );
  }, [playYear, bundle.tests]);

  // Every system that has appeared shows its range ring (overlap is intentional).
  const playRings = useMemo<RingSpec[]>(() => {
    if (playYear == null) return [];
    const seen = new Set<string>();
    const out: RingSpec[] = [];
    for (const t of bundle.tests) {
      if (t.date == null || yearOf(t.date) > playYear || seen.has(t.missile_id)) continue;
      const rb = ringByMissile.get(t.missile_id);
      if (!rb) continue;
      seen.add(t.missile_id);
      out.push({ lat: rb.lat, lon: rb.lon, radiusKm: rb.radiusKm, color: RING_TEAL, hypothetical: false, label: t.missile_name });
    }
    return out;
  }, [playYear, bundle.tests, ringByMissile]);

  // Resolve what the globe shows: playback > reach > focus.
  const globeArcs = useMemo<ResolvedTest[]>(() => {
    if (inPlayback) return playFlightArcs;
    if (reachAt) return [];
    if (focus.kind === 'site') return arcs.filter((t) => showsTrajectory(t.category));
    if (focusedCategory && !showsTrajectory(focusedCategory)) return []; // ring-only system
    return arcs;
  }, [inPlayback, playFlightArcs, reachAt, focus.kind, focusedCategory, arcs]);

  const globeRings = useMemo<RingSpec[]>(() => {
    if (inPlayback) return playRings;
    if (reachAt) return hypoRing ? [hypoRing] : [];
    return focusRing ? [focusRing] : [];
  }, [inPlayback, playRings, reachAt, hypoRing, focusRing]);

  // Fly the camera to match the active mode (playback > reach > focus > home).
  useEffect(() => {
    let target: CameraTarget | null = null;
    if (inPlayback) target = { lat: 14, lng: 80, altitude: 2.7 };
    else if (reachAt && ringBase) target = { lat: reachAt.lat, lng: reachAt.lon, altitude: ringAlt(ringBase.radiusKm) };
    else if (focus.kind === 'none') target = { lat: 13, lng: 82, altitude: 2.4 };
    else {
      const lat = focusedSite?.lat ?? ringBase?.lat ?? 13;
      const lng = focusedSite?.lon ?? ringBase?.lon ?? 82;
      const alt = ringBase ? ringAlt(ringBase.radiusKm) : focus.kind === 'site' ? 1.95 : 1.7;
      target = { lat, lng, altitude: alt };
    }
    setCamera((c) => ({ target, nonce: c.nonce + 1 }));
  }, [focus, focusedSite, ringBase, inPlayback, reachAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback timer. Clear any prior interval first so playback can never double up.
  // At the end, freeze on the final year (keep the full tableau) instead of clearing.
  useEffect(() => {
    if (!playing) return;
    if (playTimer.current) clearInterval(playTimer.current);
    setPlayYear((y) => (y == null || y >= yearRange[1] ? yearRange[0] : y));
    playTimer.current = setInterval(() => {
      setPlayYear((y) => {
        const next = (y ?? yearRange[0]) + 1;
        if (next > yearRange[1]) { setPlaying(false); return yearRange[1]; }
        return next;
      });
    }, 520);
    return () => { if (playTimer.current) clearInterval(playTimer.current); };
  }, [playing, yearRange]);

  // Exit the playback tableau entirely (back to cold-open / focus).
  const clearPlayback = () => { setPlaying(false); setPlayYear(null); };

  // Entering playback clears any active reach/relocate so the animation isn't
  // blanked (relocate hides arcs) or littered with a stale hypothetical pin.
  useEffect(() => {
    if (playing) { setRelocateMode(false); setReachAt(null); }
  }, [playing]);

  // Esc cancels relocate, otherwise exits focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (relocateMode) setRelocateMode(false);
      else if (focus.kind !== 'none') onFocus(NO_FOCUS);
      else if (!hintDismissed) setHintDismissed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [relocateMode, focus, onFocus, hintDismissed]);

  const onGlobeClick = (lat: number, lng: number) => {
    if (relocateMode) { setReachAt({ lat, lon: lng }); setRelocateMode(false); }
  };

  const reachDistance =
    reachAt && ringBase ? haversineKm(reachAt, { lat: ringBase.lat, lon: ringBase.lon }) : null;

  // Total tests behind the current focus (so a single visible arc isn't mistaken for the whole set).
  const focusCount =
    focus.kind === 'missile' ? bundle.tests.filter((t) => t.missile_id === focus.missileId).length
    : focus.kind === 'site' ? bundle.tests.filter((t) => t.site_id === focus.siteId).length
    : null;

  // On phones, picking from the index should close the overlay rail.
  const focusMissileFromRail = (id: string) => {
    onFocus({ kind: 'missile', missileId: id });
    if (typeof window !== 'undefined' && window.innerWidth <= 760) setRailOpen(false);
  };

  return (
    <div className={`mapview${railOpen ? '' : ' rail-collapsed'}`}>
      <SystemRail
        missiles={bundle.missiles}
        tests={bundle.tests}
        focusMissileId={focusMissileId}
        open={railOpen}
        onToggle={() => setRailOpen((v) => !v)}
        onFocusMissile={focusMissileFromRail}
      />
      {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} aria-hidden="true" />}

      <main className="stage">
        <div className="stage-frame anim-fade">
          <span className="tick tl" /><span className="tick tr" />
          <span className="tick bl" /><span className="tick br" />
        </div>

        <div className="stage-plate mono">
          <span className="sp-id">IMT · OSINT</span>
          <span className="sp-sub">
            {focus.kind === 'none'
              ? `INDEX · ${spanFrom}–${spanTo}`
              : focus.kind === 'test' && focusedTest
                ? `FLIGHT · ${focusedTest.date}`
                : focusedMissile
                  ? `SYSTEM · ${focusedMissile.name}`
                  : focusedSite
                    ? `SITE · ${focusedSite.name.replace(/\s*\(.+?\)/, '')}`
                    : ''}
          </span>
        </div>

        {focus.kind !== 'none' && !inPlayback && (
          <div className="focus-bar anim-down">
            <span className="fb-kind">
              {focus.kind === 'site' ? 'Site' : focus.kind === 'test' ? 'Flight' : 'System'}
            </span>
            <span className="fb-arrow">▸</span>
            <span className="fb-name">
              {focus.kind === 'test' && focusedTest
                ? `${focusedTest.missile_name} · ${focusedTest.date}`
                : focusedMissile?.name ?? focusedSite?.name.replace(/\s*\(.+?\)/, '') ?? ''}
            </span>
            {focusCount != null && <span className="fb-count mono">{focusCount} tests</span>}
            <button className="fb-exit" onClick={() => onFocus(NO_FOCUS)} title="Exit focus (Esc)">✕ Exit</button>
          </div>
        )}

        <GlobeView
          baseStyle={baseStyle}
          onBaseStyle={setBaseStyle}
          sites={sites}
          focusedSiteId={focusedSiteId}
          arcs={globeArcs}
          selectedTestId={focus.kind === 'test' ? focus.testId : null}
          rings={globeRings}
          pin={inPlayback ? null : reachAt}
          cameraTarget={camera.target}
          cameraNonce={camera.nonce}
          relocateMode={relocateMode}
          coldOpen={focus.kind === 'none' && !inPlayback}
          onSelectTest={(t) => { if (!inPlayback) onFocus({ kind: 'test', testId: t.id }); }}
          onSelectSite={(f) => { if (!inPlayback) onFocus({ kind: 'site', siteId: f.id }); }}
          onGlobeClick={onGlobeClick}
        />

        {focus.kind === 'none' && !inPlayback && !hintDismissed && (
          <div className="cold-open anim-fade">
            <button className="co-close" onClick={() => setHintDismissed(true)} aria-label="Dismiss and inspect the globe" title="Dismiss">✕</button>
            <p className="co-lead">
              Select a <b>launch site</b> on the globe, <b>search</b> a system, or{' '}
              {railOpen ? <>pick one from the <b>index</b> at left</> : <>open the <b>index</b></>} to plot its flight tests.
            </p>
            <p className="co-sub mono">{bundle.tests.length} tests · {bundle.missiles.length} systems · {bundle.facilities.length} sites · {spanFrom}–{spanTo}</p>
            <p className="co-hint mono">▶ press play to watch the programme unfold</p>
          </div>
        )}

        {inPlayback && (
          <div className="play-hud">
            <div className="play-year mono">{playYear}</div>
            <div className="play-hud-ctl mono">
              {!playing && playYear != null && playYear >= yearRange[1] && <span className="play-done">complete</span>}
              <button className="play-clear" onClick={clearPlayback}>✕ Clear</button>
            </div>
          </div>
        )}

        {ringBase && !inPlayback && (focus.kind === 'missile' || focus.kind === 'test') && (
          <div className="reach-bar mono anim-down">
            <span className="rb-tag">Reach</span>
            <button
              className={`rb-btn${relocateMode ? ' is-active' : ''}`}
              onClick={() => setRelocateMode((v) => !v)}
            >
              {relocateMode ? 'Pick a point…' : reachAt ? 'Move again ⊕' : 'Project from anywhere ⊕'}
            </button>
            {!reachAt && !relocateMode && (
              <span className="rb-hint">illustrative — this system’s reach from any launch point</span>
            )}
            {reachAt && (
              <>
                <span className="rb-readout">
                  {Math.abs(reachAt.lat).toFixed(1)}°{reachAt.lat >= 0 ? 'N' : 'S'}{' '}
                  {Math.abs(reachAt.lon).toFixed(1)}°{reachAt.lon >= 0 ? 'E' : 'W'}
                  {reachDistance != null && <> · {reachDistance.toLocaleString()} km from site</>}
                </span>
                <button className="rb-btn" onClick={() => setReachAt(null)}>↻ Reset</button>
              </>
            )}
          </div>
        )}

        {!inPlayback && (
          <DossierCard
            focus={focus}
            test={focusedTest}
            missile={focusedMissile}
            site={focusedSite}
            data={data}
            onFocus={onFocus}
          />
        )}
      </main>

      <TimelineRail
        tests={bundle.tests}
        yearMin={spanFrom}
        yearMax={spanTo}
        from={yearRange[0]}
        to={yearRange[1]}
        onRange={(a, b) => setYearRange([a, b])}
        playing={playing}
        onTogglePlay={() => setPlaying((v) => !v)}
        playYear={playYear}
        onMilestone={(missileId) => onFocus({ kind: 'missile', missileId })}
      />
    </div>
  );
}

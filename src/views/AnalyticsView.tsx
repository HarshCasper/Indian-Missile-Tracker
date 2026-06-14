import { useMemo, type ReactNode } from 'react';
import type { LoadedData } from '../dataStore';
import type { Focus } from '../state/focus';
import { CATEGORY_COLORS, OUTCOME_INK, OUTCOME_LABEL, titleCase } from '../lib/colors';
import {
  testsByYear, byCategory, byService, bySite, mostTested, categoryYearHeat,
  outcomeCounts, rangeSpectrum, headline, reliability,
} from '../lib/analytics';

interface Props { data: LoadedData; onPick: (f: Focus) => void; }

function Plate({ no, title, note, wide, children }: { no: string; title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`plate-card${wide ? ' is-wide' : ''}`}>
      <header className="plate-head">
        <span className="plate-no mono">PLATE {no}</span>
        <h3 className="plate-title">{title}</h3>
        {note && <span className="plate-note">{note}</span>}
      </header>
      <div className="plate-body">{children}</div>
    </section>
  );
}

/** Horizontal labelled bar list. */
function BarList({ rows, max, onClick }: {
  rows: { key: string; label: string; count: number; color?: string }[];
  max: number;
  onClick?: (key: string) => void;
}) {
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.key}>
          <button className="bl-row" disabled={!onClick} onClick={() => onClick?.(r.key)}>
            <span className="bl-label">{r.label}</span>
            <span className="bl-track"><span className="bl-fill" style={{ width: `${(r.count / max) * 100}%`, background: r.color ?? 'var(--accent)' }} /></span>
            <span className="bl-count mono">{r.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsView({ data, onPick }: Props) {
  const tests = data.bundle.tests;
  const missiles = data.bundle.missiles;

  const h = useMemo(() => headline(tests, missiles, data.bundle.facilities.length), [tests, missiles, data.bundle.facilities.length]);
  const years = useMemo(() => testsByYear(tests), [tests]);
  const cats = useMemo(() => byCategory(tests), [tests]);
  const svc = useMemo(() => byService(tests, data.missileById), [tests, data.missileById]);
  const sites = useMemo(() => bySite(tests), [tests]);
  const top = useMemo(() => mostTested(tests, 12), [tests]);
  const rel = useMemo(() => reliability(tests), [tests]);
  const heat = useMemo(() => categoryYearHeat(tests), [tests]);
  const oc = useMemo(() => outcomeCounts(tests), [tests]);
  const spectrum = useMemo(() => rangeSpectrum(missiles).filter((r) => r.maxRange >= 150).slice(0, 16), [missiles]);

  // Peak year(s) — surface ties rather than silently picking one.
  const peakTotal = Math.max(1, ...years.map((y) => y.total));
  const peakLabel = years.filter((y) => y.total === peakTotal).map((y) => y.year).join(' & ');

  const span = Math.max(1, h.spanTo - h.spanFrom);
  const maxYear = Math.max(1, ...years.map((y) => y.total));
  const STACK = ['success', 'partial', 'failure', 'unknown'] as const;
  const yearTicks = years.filter((b) => b.year % 5 === 0);

  const idByName = useMemo(() => new Map(missiles.map((m) => [m.id, m.name])), [missiles]);
  const logMin = Math.log10(100), logMax = Math.log10(8000);
  const logPos = (km: number) => ((Math.log10(Math.max(100, km)) - logMin) / (logMax - logMin)) * 100;

  return (
    <div className="atlas">
      <div className="atlas-head">
        <span className="eyebrow">Analytics · Plate atlas</span>
        <h2 className="atlas-title">India's missile flight-test programme, {h.spanFrom}–{h.spanTo}</h2>
      </div>

      <div className="metric-strip">
        {[
          { n: h.tests, l: 'Flight tests' },
          { n: h.systems, l: 'Systems' },
          { n: h.facilities, l: 'Launch sites' },
          { n: `${h.spanFrom}–${h.spanTo}`, l: 'Span' },
          { n: peakLabel, l: `Peak · ${peakTotal} tests` },
          { n: `${Math.round(h.successRate * 100)}%`, l: 'Success rate', t: `${oc.success} of ${oc.success + oc.partial + oc.failure} decided tests (${oc.partial} partial, ${oc.failure} failure; ${oc.unknown} unknown excluded)` },
          { n: h.nuclearSystems, l: 'Nuclear-capable' },
        ].map((m, i) => (
          <div className="metric" key={i} title={(m as { t?: string }).t}>
            <span className="m-num">{m.n}</span>
            <span className="m-label">{m.l}</span>
          </div>
        ))}
      </div>

      <div className="atlas-grid">
        <Plate no="01" title="Tests by year" note="stacked by outcome" wide>
          <svg className="year-chart" viewBox={`0 0 ${span + 1} 102`} preserveAspectRatio="none" aria-hidden="true">
            {years.map((b) => {
              const x = b.year - h.spanFrom;
              let acc = 0;
              return (
                <g key={b.year}>
                  {STACK.map((k) => {
                    const v = b[k]; if (!v) return null;
                    const ht = (v / maxYear) * 96; const y = 98 - acc - ht; acc += ht;
                    return <rect key={k} x={x + 0.12} y={y} width={0.76} height={ht} fill={OUTCOME_INK[k]} />;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="year-axis mono">
            {yearTicks.map((b) => (
              <span key={b.year} style={{ left: `${((b.year - h.spanFrom) / span) * 100}%` }}>{b.year}</span>
            ))}
          </div>
          <Legend />
        </Plate>

        <Plate no="02" title="Category mix" note={`${cats.length} roles`}>
          <BarList max={cats[0]?.count ?? 1} rows={cats.map((c) => ({ key: c.key, label: titleCase(c.key), count: c.count, color: CATEGORY_COLORS[c.key] }))} />
        </Plate>

        <Plate no="03" title="By operating service" note="overlaps — multi-service">
          <BarList max={svc[0]?.count ?? 1} rows={svc.map((s) => ({ key: s.key, label: s.key, count: s.count, color: 'var(--accent)' }))} />
        </Plate>

        <Plate no="04" title="Most-tested systems" note="select to plot on map">
          <BarList
            max={top[0]?.count ?? 1}
            rows={top.map((t) => ({ key: t.missile_id, label: t.name, count: t.count, color: CATEGORY_COLORS[t.category] }))}
            onClick={(id) => onPick({ kind: 'missile', missileId: id })}
          />
        </Plate>

        <Plate no="05" title="Reliability" note="success rate · most-proven first">
          <ul className="rel-list">
            {rel.map((r) => (
              <li key={r.missile_id}>
                <button className="rel-row" onClick={() => onPick({ kind: 'missile', missileId: r.missile_id })}>
                  <span className="rel-name">{r.name}</span>
                  <span className="rel-bar">
                    {(['success', 'partial', 'failure', 'unknown'] as const).map((k) =>
                      r[k] ? <span key={k} className="rel-seg" style={{ flex: r[k], background: OUTCOME_INK[k] }} title={`${OUTCOME_LABEL[k]}: ${r[k]}`} /> : null,
                    )}
                  </span>
                  <span className="rel-rate mono">{Math.round(r.rate * 100)}%</span>
                  <span className="rel-n mono">{r.total}</span>
                </button>
              </li>
            ))}
          </ul>
        </Plate>

        <Plate no="06" title="Outcomes" note={`${h.tests} tests`}>
          <div className="outcome-bar">
            {(['success', 'partial', 'failure', 'unknown'] as const).map((k) =>
              oc[k] ? <span key={k} className="ob-seg" style={{ flex: oc[k], background: OUTCOME_INK[k] }} title={`${OUTCOME_LABEL[k]}: ${oc[k]}`} /> : null,
            )}
          </div>
          <ul className="outcome-legend">
            {(['success', 'partial', 'failure', 'unknown'] as const).map((k) => (
              <li key={k}><span className="ol-dot" style={{ background: OUTCOME_INK[k] }} />{OUTCOME_LABEL[k]} <b className="mono">{oc[k]}</b></li>
            ))}
          </ul>
        </Plate>

        <Plate no="07" title="By launch site" note={`${data.bundle.facilities.length} sites + unattributed`}>
          <BarList max={sites[0]?.count ?? 1} rows={sites.map((s) => ({ key: s.key, label: s.key.replace(/\s*\(.+?\)/, ''), count: s.count, color: 'var(--accent-warm)' }))} />
        </Plate>

        <Plate no="08" title="Category × year" note="test density" wide>
          <div className="heat" style={{ gridTemplateColumns: `minmax(120px, 150px) repeat(${heat.years.length}, 1fr)` }}>
            <span className="heat-corner" />
            {heat.years.map((y) => (
              <span key={y} className="heat-col mono">{y % 5 === 0 ? `'${String(y).slice(2)}` : ''}</span>
            ))}
            {heat.categories.map((c, ci) => (
              <Row key={c}>
                <span className="heat-rowlabel">{titleCase(c)}</span>
                {heat.years.map((y, yi) => {
                  const v = heat.grid[ci][yi];
                  return (
                    <span
                      key={y}
                      className="heat-cell"
                      title={v ? `${titleCase(c)} · ${y}: ${v}` : undefined}
                      style={{ background: v ? `rgba(31,92,102,${0.15 + (v / heat.max) * 0.8})` : 'transparent' }}
                    >{v > 0 ? <i className="mono">{v}</i> : ''}</span>
                  );
                })}
              </Row>
            ))}
          </div>
        </Plate>

        <Plate no="09" title="Range ladder" note="max catalog / claimed range · log scale" wide>
          <div className="ladder">
            <div className="ladder-axis mono">
              {[100, 1000, 5000].map((v) => (
                <span key={v} style={{ left: `${logPos(v)}%` }}>{v.toLocaleString()} km</span>
              ))}
            </div>
            {spectrum.map((r) => (
              <button key={r.id} className="ladder-row" onClick={() => onPick({ kind: 'missile', missileId: r.id })}>
                <span className="lr-name">{idByName.get(r.id)}{r.nuclear ? ' ☢' : ''}</span>
                <span className="lr-track">
                  <span className="lr-line" style={{ width: `${logPos(r.maxRange)}%` }} />
                  <span className="lr-dot" style={{ left: `${logPos(r.maxRange)}%`, background: CATEGORY_COLORS[r.category] }} />
                </span>
                <span className="lr-km mono">{r.maxRange.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </Plate>
      </div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) { return <>{children}</>; }

function Legend() {
  return (
    <ul className="chart-legend">
      {(['success', 'partial', 'failure', 'unknown'] as const).map((k) => (
        <li key={k}><span className="cl-dot" style={{ background: OUTCOME_INK[k] }} />{OUTCOME_LABEL[k]}</li>
      ))}
    </ul>
  );
}

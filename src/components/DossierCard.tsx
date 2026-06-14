import { useMemo, type ReactNode } from 'react';
import type { LoadedData } from '../dataStore';
import type { Claim, Confidence, Facility, Missile, Outcome, ResolvedTest, Source } from '../schema';
import { OUTCOME_INK, OUTCOME_LABEL, CATEGORY_COLORS, titleCase } from '../lib/colors';
import { branchesForMissile, shortDeveloper } from '../lib/agency';
import { NO_FOCUS, type Focus } from '../state/focus';

const TIER_LABEL: Record<string, string> = {
  pib: 'PIB / official',
  'indian-news': 'Indian press',
  'foreign-news': 'Foreign / analyst',
  'further-reading': 'Further reading',
};

function fmtRange(r?: { min?: number; max?: number }): string | null {
  if (!r) return null;
  const f = (n: number) => `${n.toLocaleString()} km`;
  if (r.min != null && r.max != null) return r.min === r.max ? f(r.max) : `${r.min.toLocaleString()}–${f(r.max)}`;
  if (r.max != null) return `~${f(r.max)}`;
  if (r.min != null) return `${f(r.min)}+`;
  return null;
}

function Stamp({ kind, label }: { kind: string; label: string }) {
  return <span className={`stamp ${kind}`}>{label}</span>;
}
function confidenceStampClass(c: Confidence) {
  return c === 'confirmed' ? 'is-ok' : c === 'disputed' ? '' : 'is-muted';
}
function outcomeStampClass(o: Outcome) {
  return o === 'success' ? 'is-ok' : o === 'partial' ? 'is-partial' : o === 'failure' ? '' : 'is-muted';
}

function Spec({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="spec">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  if (!sources?.length) return null;
  const cite = sources.filter((s) => s.tier !== 'further-reading');
  const more = sources.filter((s) => s.tier === 'further-reading');
  const Item = (s: Source, i: number) => (
    <li key={i} className="src">
      <span className={`tier-tag t-${s.tier}`}>{TIER_LABEL[s.tier] ?? s.tier}</span>
      {s.url ? (
        <a href={s.url} target="_blank" rel="noreferrer" className="src-title">{s.title}</a>
      ) : (
        <span className="src-title">{s.title}</span>
      )}
      {s.publisher && <span className="src-pub">{s.publisher}</span>}
      {s.date && <span className="src-date mono">{s.date}</span>}
    </li>
  );
  return (
    <section className="dossier-sec">
      <h4 className="eyebrow">Sources <span className="sec-n">{cite.length}</span></h4>
      <ul className="src-list">{cite.map(Item)}</ul>
      {more.length > 0 && (
        <details className="src-more">
          <summary>Further reading ({more.length}) — not cited</summary>
          <ul className="src-list">{more.map(Item)}</ul>
        </details>
      )}
    </section>
  );
}

function Claims({ claims }: { claims: Claim[] }) {
  if (!claims?.length) return null;
  const val = (c: Claim) =>
    c.value != null ? c.value.toLocaleString()
    : c.min != null && c.max != null ? `${c.min.toLocaleString()}–${c.max.toLocaleString()}`
    : c.max != null ? `~${c.max.toLocaleString()}`
    : c.min != null ? `${c.min.toLocaleString()}+`
    : c.text ?? '—';
  return (
    <section className="dossier-sec">
      <h4 className="eyebrow">Disputed figures <span className="sec-n">{claims.length}</span></h4>
      <ul className="claim-list">
        {claims.map((c, i) => (
          <li key={i} className="claim">
            <span className="claim-field">{titleCase(c.field.replace(/_/g, '-'))}</span>
            <span className="claim-basis">{c.basis}</span>
            <span className="claim-val mono">{val(c)}</span>
            <span className="claim-src">{c.source.title}</span>
            {c.note && <span className="claim-note">{c.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface Props {
  focus: Focus;
  test: ResolvedTest | null;
  missile: Missile | null;
  site: Facility | null;
  data: LoadedData;
  onFocus: (f: Focus) => void;
}

export function DossierCard({ focus, test, missile, site, data, onFocus }: Props) {
  const missileTests = useMemo(() => {
    if (!missile) return [];
    return data.bundle.tests
      .filter((t) => t.missile_id === missile.id)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [missile, data.bundle.tests]);

  const siteInfo = useMemo(() => {
    if (focus.kind !== 'site' || !site) return null;
    const here = data.bundle.tests.filter((t) => t.site_id === site.id);
    const bySys = new Map<string, { name: string; count: number }>();
    for (const t of here) {
      const r = bySys.get(t.missile_id) ?? { name: t.missile_name, count: 0 };
      r.count += 1; bySys.set(t.missile_id, r);
    }
    return { count: here.length, systems: [...bySys.entries()].sort((a, b) => b[1].count - a[1].count) };
  }, [focus.kind, site, data.bundle.tests]);

  if (focus.kind === 'none') return null;

  // -- FLIGHT (single test) --------------------------------------------------
  if (focus.kind === 'test' && test) {
    return (
      <article className="dossier anim-rise" aria-label="Flight dossier">
        <Close onFocus={onFocus} />
        <header className="dossier-head">
          <span className="eyebrow">Flight test</span>
          <h3 className="dossier-title">{test.missile_name}</h3>
          <span className="dossier-sub mono">{test.date}{test.designation ? ` · ${test.designation}` : ''}</span>
        </header>
        <div className="stamp-row">
          <Stamp kind={outcomeStampClass(test.outcome)} label={OUTCOME_LABEL[test.outcome]} />
          <Stamp kind={confidenceStampClass(test.confidence)} label={test.confidence} />
          {test.needs_primary_source && <Stamp kind="" label="No primary source" />}
        </div>
        <button className="dossier-link" onClick={() => onFocus({ kind: 'missile', missileId: test.missile_id })}>
          ▸ View system: {test.missile_name}
        </button>
        <dl className="spec-grid">
          <Spec label="Date" value={`${test.date} (${test.date_precision})`} />
          <Spec label="Launch site" value={test.site_name ?? 'Unattributed'} />
          <Spec label="Variant" value={test.variant ?? undefined} />
          <Spec label="Range tested" value={test.range_tested_km ? `${test.range_tested_km.toLocaleString()} km` : undefined} />
          <Spec label="Apogee" value={test.apogee_km != null ? `${test.apogee_km.toLocaleString()} km` : undefined} />
          <Spec label="Outcome" value={OUTCOME_LABEL[test.outcome]} />
        </dl>
        {test.description && <p className="dossier-desc">{test.description}</p>}
        <Claims claims={test.claims} />
        {test.notes && <p className="dossier-note">{test.notes}</p>}
        <Sources sources={test.sources} />
      </article>
    );
  }

  // -- SITE (facility) -------------------------------------------------------
  if (focus.kind === 'site' && site && siteInfo) {
    return (
      <article className="dossier anim-rise" aria-label="Site dossier">
        <Close onFocus={onFocus} />
        <header className="dossier-head">
          <span className="eyebrow">Launch facility</span>
          <h3 className="dossier-title">{site.name.replace(/\s*\(.+?\)/, '')}</h3>
          <span className="dossier-sub mono">{site.state ?? ''}</span>
        </header>
        <dl className="spec-grid">
          <Spec label="Coordinates" value={<span className="mono">{site.lat.toFixed(3)}°N {site.lon.toFixed(3)}°E</span>} />
          <Spec label="Test corridor" value={<span className="mono">{site.default_bearing}° (indicative)</span>} />
          <Spec label="Tests conducted" value={<span className="mono">{siteInfo.count}</span>} />
          <Spec label="Systems" value={<span className="mono">{siteInfo.systems.length}</span>} />
        </dl>
        <section className="dossier-sec">
          <h4 className="eyebrow">Systems tested here <span className="sec-n">{siteInfo.systems.length}</span></h4>
          <ul className="mini-list">
            {siteInfo.systems.map(([id, r]) => (
              <li key={id}>
                <button className="mini-item" onClick={() => onFocus({ kind: 'missile', missileId: id })}>
                  <span>{r.name}</span><span className="mono">{r.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {site.notes && <p className="dossier-note">{site.notes}</p>}
        <Sources sources={site.sources} />
      </article>
    );
  }

  // -- SYSTEM (missile) ------------------------------------------------------
  if (missile) {
    const branches = branchesForMissile(missile);
    return (
      <article className="dossier anim-rise" aria-label="System dossier">
        <Close onFocus={onFocus} />
        <header className="dossier-head">
          <span className="eyebrow" style={{ color: CATEGORY_COLORS[missile.category] }}>{titleCase(missile.category)}</span>
          <h3 className="dossier-title">{missile.name}</h3>
          {missile.aka?.length > 0 && <span className="dossier-sub">{missile.aka.join(' · ')}</span>}
        </header>
        <div className="stamp-row">
          <Stamp kind="is-muted" label={missile.status} />
          <Stamp kind={confidenceStampClass(missile.confidence)} label={missile.confidence} />
          {missile.nuclear_capable && <Stamp kind="is-partial" label="Nuclear-capable" />}
        </div>
        {missile.description && <p className="dossier-desc">{missile.description}</p>}
        <dl className="spec-grid">
          <Spec label="Class" value={missile.range_class} />
          <Spec label="Range" value={fmtRange(missile.range_km) ?? undefined} />
          <Spec label="Speed" value={missile.speed_mach != null ? `Mach ${missile.speed_mach}` : undefined} />
          <Spec label="Payload" value={missile.payload_kg != null ? `${missile.payload_kg.toLocaleString()} kg` : undefined} />
          <Spec label="Propulsion" value={missile.propulsion} />
          <Spec label="Platform" value={missile.launch_platform?.length ? missile.launch_platform.join(', ') : undefined} />
          <Spec label="Developer" value={shortDeveloper(missile.developer)} />
          <Spec label="Operators" value={branches.join(', ')} />
          <Spec label="First test" value={missile.first_test ?? undefined} />
          <Spec label="Flight tests" value={<span className="mono">{missileTests.length}</span>} />
        </dl>
        {missile.variants?.length > 0 && (
          <section className="dossier-sec">
            <h4 className="eyebrow">Variants <span className="sec-n">{missile.variants.length}</span></h4>
            <ul className="mini-list">
              {missile.variants.map((v, i) => (
                <li key={i} className="variant"><span>{v.name}</span>{fmtRange(v.range_km) && <span className="mono">{fmtRange(v.range_km)}</span>}</li>
              ))}
            </ul>
          </section>
        )}
        <Claims claims={missile.claims} />
        <section className="dossier-sec">
          <h4 className="eyebrow">Flight tests <span className="sec-n">{missileTests.length}</span></h4>
          <ul className="mini-list scroll">
            {missileTests.map((t) => (
              <li key={t.id}>
                <button className="mini-item" onClick={() => onFocus({ kind: 'test', testId: t.id })}>
                  <span className="mi-dot" style={{ background: OUTCOME_INK[t.outcome] }} />
                  <span className="mono">{t.date}</span>
                  <span className="mi-meta">{t.site_name?.replace(/\s*\(.+?\)/, '') ?? '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {missile.notes && <p className="dossier-note">{missile.notes}</p>}
        <Sources sources={missile.sources} />
      </article>
    );
  }

  return null;
}

function Close({ onFocus }: { onFocus: (f: Focus) => void }) {
  return (
    <button className="dossier-close" onClick={() => onFocus(NO_FOCUS)} aria-label="Close dossier" title="Close (Esc)">✕</button>
  );
}

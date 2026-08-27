import { useMemo, useState } from 'react';
import type { LoadedData } from '../dataStore';
import type { Category, Outcome, ResolvedTest } from '../schema';
import { CATEGORIES, OUTCOMES } from '../schema';
import { OUTCOME_INK, OUTCOME_LABEL, titleCase } from '../lib/colors';
import { branchesFor } from '../lib/agency';
import type { Focus } from '../state/focus';

interface Props { data: LoadedData; onPick: (f: Focus) => void; }

type SortKey = 'date' | 'system' | 'category' | 'site' | 'range' | 'outcome' | 'confidence';

interface Row {
  test: ResolvedTest;
  service: string;
  range: number | null;
  sources: number;
}

const COLS: { key: SortKey; label: string; cls?: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'system', label: 'System' },
  { key: 'category', label: 'Role' },
  { key: 'site', label: 'Launch site' },
  { key: 'range', label: 'Range', cls: 'num' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'confidence', label: 'Confidence' },
];

export function DatabaseView({ data, onPick }: Props) {
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<Set<Category>>(new Set());
  const [outs, setOuts] = useState<Set<Outcome>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const allRows = useMemo<Row[]>(
    () =>
      data.bundle.tests.map((t) => ({
        test: t,
        service: branchesFor(data.missileById.get(t.missile_id)?.operators).join(', '),
        // 0 is a placeholder for "not a range test" (SAMs, ATGMs, BMD intercepts) — treat as unknown.
        range: t.range_tested_km || null,
        sources: t.sources.filter((s) => s.tier !== 'further-reading').length,
      })),
    [data],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = allRows.filter(({ test: t }) => {
      if (cats.size && !cats.has(t.category)) return false;
      if (outs.size && !outs.has(t.outcome)) return false;
      if (needle) {
        const hay = [t.missile_name, t.date, t.designation, t.variant, t.site_name, t.category].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const cmp = (a: Row, b: Row): number => {
      switch (sort.key) {
        case 'date': return (a.test.date ?? '').localeCompare(b.test.date ?? '');
        case 'system': return a.test.missile_name.localeCompare(b.test.missile_name);
        case 'category': return a.test.category.localeCompare(b.test.category);
        case 'site': return (a.test.site_name ?? '').localeCompare(b.test.site_name ?? '');
        case 'range': return (a.range ?? -1) - (b.range ?? -1);
        case 'outcome': return a.test.outcome.localeCompare(b.test.outcome);
        case 'confidence': return a.test.confidence.localeCompare(b.test.confidence);
      }
    };
    return [...filtered].sort((a, b) => cmp(a, b) * sort.dir);
  }, [allRows, q, cats, outs, sort]);

  const toggle = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    fn(next);
  };
  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'date' ? -1 : 1 }));

  return (
    <div className="db">
      <div className="db-head">
        <div className="db-headline">
          <span className="eyebrow">Database · Record table</span>
          <h2 className="db-title">{rows.length} of {allRows.length} flight tests</h2>
        </div>
        <a className="btn db-rss" href={`${import.meta.env.BASE_URL}rss.xml`} target="_blank" rel="noreferrer"
           title="Subscribe to be notified when systems/tests are added">
          <span className="rss-glyph" aria-hidden="true">⦿</span> Subscribe (RSS)
        </a>
      </div>

      <div className="db-filters">
        <input
          className="search-input db-search" type="search" placeholder="Filter by system, date, site…"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tests"
        />
        <div className="chip-set">
          {OUTCOMES.map((o) => (
            <button key={o} className={`chip-sm${outs.has(o) ? ' is-active' : ''}`} onClick={() => toggle(outs, o, setOuts)}>
              <span className="cs-dot" style={{ background: OUTCOME_INK[o] }} />{OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        <div className="chip-set chip-cats">
          {CATEGORIES.filter((c) => allRows.some((r) => r.test.category === c)).map((c) => (
            <button key={c} className={`chip-sm${cats.has(c) ? ' is-active' : ''}`} onClick={() => toggle(cats, c, setCats)}>{titleCase(c)}</button>
          ))}
        </div>
        {(q || cats.size || outs.size) && (
          <button className="db-clear" onClick={() => { setQ(''); setCats(new Set()); setOuts(new Set()); }}>Clear</button>
        )}
      </div>

      <div className="db-tablewrap">
        <table className="db-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.cls} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  <button className="th-btn" onClick={() => setSortKey(c.key)}>
                    {c.label}{sort.key === c.key && <span className="th-dir">{sort.dir === 1 ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
              <th className="num">Src</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.test.id} role="button"
                  aria-label={`${r.test.missile_name}, ${r.test.date}, ${r.test.outcome}`}
                  onClick={() => onPick({ kind: 'test', testId: r.test.id })} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick({ kind: 'test', testId: r.test.id }); } }}>
                <td className="mono td-date">{r.test.date}</td>
                <td className="td-system">{r.test.missile_name}{r.test.designation && <span className="td-desig">{r.test.designation}</span>}</td>
                <td>{titleCase(r.test.category)}</td>
                <td className="td-site">{r.test.site_name?.replace(/\s*\(.+?\)/, '') ?? '—'}</td>
                <td className="num mono">{r.range != null ? r.range.toLocaleString() : '—'}</td>
                <td><span className="td-outcome"><span className="to-dot" style={{ background: OUTCOME_INK[r.test.outcome] }} />{OUTCOME_LABEL[r.test.outcome]}</span></td>
                <td><span className={`conf conf-${r.test.confidence}`}>{r.test.confidence}</span></td>
                <td className="num mono">{r.sources}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="db-empty">No tests match the current filters.</p>}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Missile, ResolvedTest } from '../schema';
import { OUTCOME_INK } from '../lib/colors';
import type { Focus } from '../state/focus';

interface Props {
  missiles: Missile[];
  tests: ResolvedTest[];
  onPick: (f: Focus) => void;
}

/**
 * SearchBox — one field, two kinds of hit. Systems match first (focusing a
 * system isolates all its tests + range ring); individual flight tests match by
 * date, designation, variant, or site. Picking either drives the Map focus.
 */
export function SearchBox({ missiles, tests, onPick }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const { systems, flights } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return { systems: [] as Missile[], flights: [] as ResolvedTest[] };
    const systems = missiles
      .filter((m) => [m.name, ...(m.aka ?? [])].join(' ').toLowerCase().includes(needle))
      .slice(0, 5);
    const flights = tests
      .filter((t) =>
        [t.missile_name, t.date ?? '', t.designation ?? '', t.variant ?? '', t.site_name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 5);
    return { systems, flights };
  }, [q, missiles, tests]);

  const hasResults = systems.length > 0 || flights.length > 0;

  return (
    <div
      className="searchbox"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      <input
        className="search-input"
        type="search"
        placeholder="Search system, date, mission…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-label="Search systems and tests"
      />
      {open && q.trim() && (
        // preventDefault on mousedown keeps the input focused so the click lands
        // on the result instead of the blur closing the list first.
        <ul className="search-results" onMouseDown={(e) => e.preventDefault()}>
          {!hasResults && <li className="search-empty">No systems or tests match “{q.trim()}”.</li>}
          {systems.map((m) => (
            <li key={`m-${m.id}`}>
              <button
                className="search-result"
                onClick={() => { onPick({ kind: 'missile', missileId: m.id }); setOpen(false); }}
              >
                <span className="search-kind">SYS</span>
                <span className="search-name">{m.name}</span>
                <span className="search-meta">{m.range_class ?? m.category}</span>
              </button>
            </li>
          ))}
          {flights.map((t) => (
            <li key={`t-${t.id}`}>
              <button
                className="search-result"
                onClick={() => { onPick({ kind: 'test', testId: t.id }); setOpen(false); }}
              >
                <span className="search-dot" style={{ background: OUTCOME_INK[t.outcome] }} />
                <span className="search-name">{t.missile_name}</span>
                <span className="search-meta">{t.date ?? '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

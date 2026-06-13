import { useMemo } from 'react';
import type { Missile, ResolvedTest, Category } from '../schema';
import { CATEGORY_COLORS, titleCase } from '../lib/colors';

interface Props {
  missiles: Missile[];
  tests: ResolvedTest[];
  focusMissileId: string | null;
  open: boolean;
  onToggle: () => void;
  onFocusMissile: (id: string) => void;
}

interface Row { id: string; name: string; category: Category; count: number; }

/**
 * SystemRail — the system index. Replaces the old checkbox sidebar: a clean,
 * grouped, document-style list of every system (with its test count). Clicking
 * one focuses it on the globe (isolates its arcs + range ring).
 */
export function SystemRail({ missiles, tests, focusMissileId, open, onToggle, onFocusMissile }: Props) {
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tests) counts.set(t.missile_id, (counts.get(t.missile_id) ?? 0) + 1);
    const rows: Row[] = missiles.map((m) => ({ id: m.id, name: m.name, category: m.category, count: counts.get(m.id) ?? 0 }));
    const byCat = new Map<Category, Row[]>();
    for (const r of rows) (byCat.get(r.category) ?? byCat.set(r.category, []).get(r.category)!).push(r);
    return [...byCat.entries()]
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        total: items.reduce((s, r) => s + r.count, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [missiles, tests]);

  if (!open) {
    return (
      <button className="rail-tab" onClick={onToggle} aria-label="Open system index">
        <span>SYSTEM INDEX</span>
      </button>
    );
  }

  return (
    <aside className="rail anim-fade" aria-label="System index">
      <div className="rail-head">
        <span className="eyebrow">System Index</span>
        <button className="rail-collapse" onClick={onToggle} title="Collapse index" aria-label="Collapse index">◀</button>
      </div>
      <p className="rail-hint mono">{missiles.length} systems · grouped by role</p>
      <div className="rail-body">
        {groups.map((g) => (
          <div className="rail-group" key={g.category}>
            <div className="rail-group-h">
              <span className="rg-dot" style={{ background: CATEGORY_COLORS[g.category] }} />
              <span className="rg-name">{titleCase(g.category)}</span>
              <span className="rg-count mono">{g.items.length}</span>
            </div>
            {g.items.map((r) => (
              <button
                key={r.id}
                className={`rail-item${focusMissileId === r.id ? ' is-active' : ''}`}
                onClick={() => onFocusMissile(r.id)}
              >
                <span className="ri-name">{r.name}</span>
                <span className="ri-count mono">{r.count}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

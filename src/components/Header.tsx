import type { ReactNode } from 'react';

export type ViewId = 'map' | 'analytics' | 'database';

const TABS: { id: ViewId; no: string; label: string }[] = [
  { id: 'map', no: '01', label: 'Map' },
  { id: 'analytics', no: '02', label: 'Analytics' },
  { id: 'database', no: '03', label: 'Database' },
];

interface Props {
  view: ViewId;
  onView: (v: ViewId) => void;
  systems: number;
  tests: number;
  spanFrom: number;
  spanTo: number;
  search: ReactNode;
}

export function Header({ view, onView, systems, tests, spanFrom, spanTo, search }: Props) {
  return (
    <header className="frame-top anim-down">
      <div className="brand">
        <img className="brand-mark" src={`${import.meta.env.BASE_URL}chakra.svg`} width={30} height={30} alt="Ashoka chakra" />
        <div className="brand-text">
          <span className="brand-name">Indian Missile Tracker</span>
          <span className="brand-sub">OSINT flight-test register</span>
        </div>
      </div>

      <nav className="nav" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-tab${view === t.id ? ' is-active' : ''}`}
            aria-current={view === t.id ? 'page' : undefined}
            onClick={() => onView(t.id)}
          >
            <span className="tab-no">{t.no}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="frame-right">
        {search}
        <div className="frame-readout mono" aria-hidden="true">
          <div>
            <b>{systems}</b> <span className="ro-label">systems</span> · <b>{tests}</b>{' '}
            <span className="ro-label">tests</span>
          </div>
          <div>
            <span className="ro-label">range</span> {spanFrom}–{spanTo}
          </div>
        </div>
      </div>
    </header>
  );
}

export function ClassificationFooter() {
  return (
    <footer className="frame-class">
      <span>// Open-source intelligence</span>
      <span className="sep fc-long">·</span>
      <span className="fc-long">Compiled from public releases</span>
      <span className="sep">·</span>
      <span><b>Unclassified</b></span>
      <span className="sep fc-long">·</span>
      <span className="fc-long">Indicative trajectories — not affiliated with GoI / DRDO</span>
    </footer>
  );
}

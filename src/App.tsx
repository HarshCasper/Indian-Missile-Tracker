import { useEffect, useState } from 'react';
import { loadData, type LoadedData } from './dataStore';
import { Header, ClassificationFooter, type ViewId } from './components/Header';
import { SearchBox } from './components/SearchBox';
import { MapView } from './views/MapView';
import { AnalyticsView } from './views/AnalyticsView';
import { DatabaseView } from './views/DatabaseView';
import { NO_FOCUS, type Focus } from './state/focus';

const yearOf = (iso: string) => Number(iso.slice(0, 4));

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>('map');
  const [focus, setFocus] = useState<Focus>(NO_FOCUS);

  useEffect(() => {
    loadData()
      .then((d) => {
        setData(d);
        // Deep link from the RSS feed: ?test=<id> focuses that flight on the map.
        const id = new URLSearchParams(window.location.search).get('test');
        if (id && d.testById.has(id)) {
          setFocus({ kind: 'test', testId: id });
          setView('map');
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="splash">Failed to load register — {error}</div>;
  if (!data) return <div className="splash">Loading flight-test register…</div>;

  // A search/database pick focuses the target and jumps to the map.
  const pick = (f: Focus) => {
    setFocus(f);
    setView('map');
  };

  return (
    <div className="plate">
      <Header
        view={view}
        onView={setView}
        systems={data.bundle.missiles.length}
        tests={data.bundle.tests.length}
        spanFrom={yearOf(data.dateExtent[0])}
        spanTo={yearOf(data.dateExtent[1])}
        search={<SearchBox missiles={data.bundle.missiles} tests={data.bundle.tests} onPick={pick} />}
      />

      <div className="view">
        {view === 'map' && <MapView data={data} focus={focus} onFocus={setFocus} />}
        {view === 'analytics' && <AnalyticsView data={data} onPick={pick} />}
        {view === 'database' && <DatabaseView data={data} onPick={pick} />}
      </div>

      <ClassificationFooter />
    </div>
  );
}

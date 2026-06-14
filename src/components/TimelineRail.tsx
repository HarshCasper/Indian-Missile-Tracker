import { useMemo } from 'react';
import type { ResolvedTest } from '../schema';
import { testsByYear } from '../lib/analytics';
import { resolveMilestones } from '../lib/milestones';
import { OUTCOME_INK } from '../lib/colors';

interface Props {
  tests: ResolvedTest[];
  yearMin: number;
  yearMax: number;
  from: number;
  to: number;
  onRange: (from: number, to: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  playYear: number | null;
  onMilestone: (missileId: string) => void;
}

/**
 * TimelineRail — the annotated era rail: a stacked tests-per-year histogram, a
 * dual-handle year brush, milestone flags with hover popups, and playback.
 */
export function TimelineRail({
  tests, yearMin, yearMax, from, to, onRange, playing, onTogglePlay, playYear, onMilestone,
}: Props) {
  const buckets = useMemo(() => testsByYear(tests), [tests]);
  const milestones = useMemo(() => resolveMilestones(tests), [tests]);
  const span = Math.max(1, yearMax - yearMin);
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
  const pct = (y: number) => ((y - yearMin) / span) * 100;
  // Fractional-year position (uses the month) so milestones in the same year
  // don't stack on top of each other.
  const fpos = (iso: string, yr: number) => yr + (iso.length >= 7 ? Number(iso.slice(5, 7)) - 1 : 0) / 12;

  // Frozen end-tableau: sweep finished (at the brush end) but still on screen.
  const ended = !playing && playYear != null && playYear >= to;

  // Stacked bars, success at the bottom so failures (top) stay visible.
  const STACK: Array<keyof typeof OUTCOME_INK> = ['success', 'partial', 'failure', 'unknown'];

  return (
    <div className="timeline" aria-label="Timeline">
      <button
        className={`tl-play${playing ? ' is-playing' : ''}`}
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause playback' : ended ? 'Replay from the start' : 'Play chronological sweep'}
        title={playing ? 'Pause' : ended ? 'Replay 1985 → today' : 'Play 1985 → today'}
      >
        {playing ? '❙❙' : ended ? '↻' : '▶'}
      </button>

      <div className="tl-track">
        <svg className="tl-hist" viewBox={`0 0 ${span + 1} 100`} preserveAspectRatio="none" aria-hidden="true">
          {buckets.map((b) => {
            const x = b.year - yearMin;
            const dim = b.year < from || b.year > to;
            let acc = 0;
            return (
              <g key={b.year} opacity={dim ? 0.28 : 1}>
                {STACK.map((k) => {
                  const v = b[k];
                  if (!v) return null;
                  const h = (v / maxTotal) * 96;
                  const y = 100 - acc - h;
                  acc += h;
                  return <rect key={k} x={x + 0.12} y={y} width={0.76} height={h} fill={OUTCOME_INK[k]} />;
                })}
              </g>
            );
          })}
        </svg>

        {/* selected-window shading */}
        <div className="tl-window" style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }} />

        {/* milestone flags */}
        {milestones.map((m) => (
          <button
            key={m.missile_id}
            className="tl-flag"
            style={{ left: `${pct(fpos(m.date, m.year))}%` }}
            onClick={() => onMilestone(m.missile_id)}
            aria-label={`${m.label}, ${m.year}`}
          >
            <span className="tf-stick" />
            <span className="tf-dot" />
            <span className="tl-popup">
              <span className="tp-year mono">{m.date}</span>
              <span className="tp-label">{m.label}</span>
              <span className="tp-blurb">{m.blurb}</span>
            </span>
          </button>
        ))}

        {/* playhead */}
        {playYear != null && <div className="tl-playhead" style={{ left: `${pct(playYear)}%` }} />}

        {/* dual-handle brush — locked during playback so the sweep isn't disturbed */}
        <input
          className="tl-brush tl-from" type="range" min={yearMin} max={yearMax} value={from} disabled={playing}
          onChange={(e) => onRange(Math.min(+e.target.value, to), to)} aria-label="Range start year"
        />
        <input
          className="tl-brush tl-to" type="range" min={yearMin} max={yearMax} value={to} disabled={playing}
          onChange={(e) => onRange(from, Math.max(+e.target.value, from))} aria-label="Range end year"
        />
      </div>

      <div className="tl-readout mono">
        <span className="tlr-range">{from}<span className="tlr-dash">–</span>{to}</span>
        <span className="tlr-span">{yearMin} · {yearMax}</span>
      </div>
    </div>
  );
}

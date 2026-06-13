/**
 * ReticleMark — a targeting reticle derived from the Ashoka-chakra spoke ring:
 * an outer circle, a crosshair, N radial spokes, and a stamp-red center pip.
 * Used as the wordmark glyph, the focus-loading overlay, and the reach marker.
 */
interface Props {
  size?: number;
  spokes?: number;
  spin?: boolean;
  /** Spin period in seconds when `spin` is set. */
  period?: number;
  className?: string;
}

export function ReticleMark({ size = 30, spokes = 12, spin = false, period = 40, className = '' }: Props) {
  const cx = 16, cy = 16;
  const ticks = Array.from({ length: spokes }, (_, i) => (i * 360) / spokes);
  const r1 = spokes > 16 ? 11.5 : 10;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <circle cx={cx} cy={cy} r="14.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.9" />
      <g style={spin ? { animation: `imt-spin ${period}s linear infinite`, transformOrigin: '16px 16px' } : undefined}>
        {ticks.map((a, i) => {
          const rad = (a * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={cx + Math.cos(rad) * r1}
              y1={cy + Math.sin(rad) * r1}
              x2={cx + Math.cos(rad) * 13.5}
              y2={cy + Math.sin(rad) * 13.5}
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.75"
            />
          );
        })}
      </g>
      <path d="M16 0.5v6M16 25.5v6M0.5 16h6M25.5 16h6" stroke="currentColor" strokeWidth="1.1" />
      <circle cx={cx} cy={cy} r="2" fill="var(--stamp)" />
    </svg>
  );
}

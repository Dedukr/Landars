/**
 * Hand-drawn seasonal SVG pieces (Christmas / New Year). Decorative only:
 * every piece is aria-hidden and colour comes from the --festive-* tokens.
 */

type ArtProps = { className?: string };

export function FirBranch({ className = "" }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 34 C40 30 78 28 116 18"
        fill="none"
        stroke="var(--festive-bark)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {Array.from({ length: 13 }).map((_, i) => {
        const x = 10 + i * 8;
        const y = 33.5 - i * 1.15;
        return (
          <g key={i} stroke="var(--festive-pine)" strokeWidth="2" strokeLinecap="round">
            <path d={`M${x} ${y} l-6 -11`} />
            <path d={`M${x} ${y} l-7 10`} />
            <path d={`M${x + 3} ${y - 0.5} l-3 -13`} opacity="0.75" />
            <path d={`M${x + 3} ${y - 0.5} l-4 12`} opacity="0.75" />
          </g>
        );
      })}
      <line x1="62" y1="27" x2="62" y2="40" stroke="var(--festive-gold)" strokeWidth="1.2" />
      <circle cx="62" cy="47" r="8" fill="var(--festive-red)" />
      <path d="M57 44 a6 6 0 0 1 5 -3" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="59" y="37.5" width="6" height="3.2" rx="1" fill="var(--festive-gold)" />
      <line x1="92" y1="22" x2="92" y2="30" stroke="var(--festive-gold)" strokeWidth="1.2" />
      <circle cx="92" cy="35" r="5.5" fill="var(--festive-gold)" />
    </svg>
  );
}

export function Sparkles({ className = "" }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 120 64" aria-hidden="true" focusable="false">
      {[
        [22, 20, 9],
        [58, 38, 13],
        [96, 16, 8],
        [86, 46, 5],
        [36, 48, 5],
        [108, 34, 4],
      ].map(([x, y, r], i) => (
        <path
          key={i}
          className="season-sparkle"
          style={{ animationDelay: `${i * 0.35}s` }}
          d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`}
          fill="var(--festive-gold)"
        />
      ))}
    </svg>
  );
}

export function HollySprig({ className = "" }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 40 32" aria-hidden="true" focusable="false">
      <path
        d="M20 18 C14 8 8 12 2 6 C6 12 4 16 8 20 C12 18 14 22 20 18Z"
        fill="var(--festive-pine)"
      />
      <path
        d="M20 18 C26 8 32 12 38 6 C34 12 36 16 32 20 C28 18 26 22 20 18Z"
        fill="var(--festive-pine-light)"
      />
      <circle cx="17" cy="21" r="3.4" fill="var(--festive-red)" />
      <circle cx="23" cy="21.5" r="3.4" fill="var(--festive-red)" />
      <circle cx="20" cy="25.5" r="3.4" fill="var(--festive-red-deep)" />
      <circle cx="16" cy="20" r="0.9" fill="#fff" opacity="0.7" />
    </svg>
  );
}

/** Tiny Santa hat that sits on the basket icon while the basket is Christmas. */
export function SantaHat({ className = "" }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 28 22" aria-hidden="true" focusable="false">
      <path d="M4 16 C6 6 14 1 22 4 C25 6 25 10 24 13 L20 9 C18 12 12 15 4 16Z" fill="var(--festive-red)" />
      <rect x="2" y="14.5" width="20" height="5.5" rx="2.75" fill="#fffdf8" />
      <circle cx="24.2" cy="14" r="3" fill="#fffdf8" />
    </svg>
  );
}

/** Snow drift draped over the logo's top edge. */
export function SnowCap({ className = "" }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path
        d="M0 6 C10 0 18 2 26 4 C34 7 40 1 50 2 C60 3 64 8 74 6 C84 4 90 0 100 3 C108 5 114 2 120 5 L120 9 C114 10 110 16 104 12 C98 9 94 15 86 12 C78 9 72 14 64 11 C56 8 50 15 42 12 C34 9 30 14 22 11 C14 8 8 15 0 10Z"
        fill="#fffdf8"
      />
    </svg>
  );
}

const SWAG_W = 240;
const SWAG_H = 30;
const BULBS_PER_SWAG = 6;
const SWAG_COUNT = 10; // covers ~2400px; the strip is clipped to the viewport
const BULB_COLORS = [
  "var(--festive-red)",
  "var(--festive-gold)",
  "var(--festive-pine-light)",
  "var(--festive-bulb-4)",
];

/** One sagging wire segment; bulbs keep their shape at any screen width. */
function GarlandSwag({ index }: { index: number }) {
  return (
    <svg
      width={SWAG_W}
      height={SWAG_H}
      viewBox={`0 0 ${SWAG_W} ${SWAG_H}`}
      className="season-garland-swag"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={`M0 2 Q${SWAG_W / 2} 22 ${SWAG_W} 2`}
        fill="none"
        stroke="var(--festive-wire)"
        strokeWidth="1.4"
      />
      {Array.from({ length: BULBS_PER_SWAG }).map((_, i) => {
        const t = (i + 0.5) / BULBS_PER_SWAG;
        const x = t * SWAG_W;
        // Point on the quadratic swag (ends at y=2, control at y=22): peak y=12.
        const y = 2 + 40 * t * (1 - t);
        const n = index * BULBS_PER_SWAG + i;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x="-2.2" y="-1" width="4.4" height="4" rx="1" fill="var(--festive-wire)" />
            <ellipse
              className="season-bulb"
              style={{ animationDelay: `${(n * 0.37) % 2.6}s` }}
              cx="0"
              cy="8.5"
              rx="3.6"
              ry="5.4"
              fill={BULB_COLORS[n % BULB_COLORS.length]}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Fairy-light garland: sagging wire with bulbs that twinkle out of sync. */
export function Garland({ className = "" }: ArtProps) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: SWAG_COUNT }).map((_, i) => (
        <GarlandSwag key={i} index={i} />
      ))}
    </div>
  );
}

/** Footer horizon: fir trees, a gingerbread house and a star. */
export function WinterHorizon({ className = "" }: ArtProps) {
  const trees = [
    [30, 1], [78, 0.75], [118, 0.9], [300, 0.7], [340, 1.05], [520, 0.8],
    [690, 0.95], [740, 0.7], [910, 1], [960, 0.8], [1120, 0.9], [1165, 0.7],
  ];
  return (
    <svg
      className={className}
      viewBox="0 0 1200 90"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 78 C120 70 240 74 360 72 C520 68 640 76 800 72 C960 68 1080 74 1200 70 L1200 90 L0 90Z"
        fill="var(--festive-horizon)"
      />
      {trees.map(([x, s], i) => (
        <g key={i} transform={`translate(${x} 78) scale(${s})`} fill="var(--festive-horizon)">
          <path d="M0 -62 L16 -34 L8 -34 L22 -12 L-22 -12 L-8 -34 L-16 -34Z" />
          <rect x="-3" y="-12" width="6" height="8" />
        </g>
      ))}
      <g transform="translate(600 76)" fill="var(--festive-horizon)">
        <path d="M-34 0 V-30 L0 -56 L34 -30 V0Z" />
        <rect x="18" y="-58" width="8" height="16" />
      </g>
      <g transform="translate(600 76)" fill="var(--festive-window)">
        <rect x="-22" y="-24" width="10" height="10" rx="1.5" />
        <rect x="12" y="-24" width="10" height="10" rx="1.5" />
        <path d="M-6 0 V-14 a6 6 0 0 1 12 0 V0Z" />
      </g>
      <path
        className="season-star"
        d="M860 14 L863 22 L871 22 L865 27 L867 35 L860 30 L853 35 L855 27 L849 22 L857 22Z"
        fill="var(--festive-gold)"
      />
    </svg>
  );
}

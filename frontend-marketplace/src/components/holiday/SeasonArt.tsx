/**
 * Seasonal SVG art for Christmas and New Year: "gilded hamper" line-work in
 * evergreen, claret and brushed-gold foil. Decorative only: every piece is
 * aria-hidden and takes its colours from the --festive-* tokens in season.css.
 */

import { useId } from "react";

type ArtProps = { className?: string };

/** useId() output is safe in HTML ids but contains ":", which url(#…) dislikes. */
function useSvgId(): string {
  return useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Brushed-gold foil. userSpaceOnUse so hairline strokes (zero-height boxes)
 * still pick the gradient up. Render once per <svg>; reference with url(#id).
 */
function FoilDefs({ id, w, h }: { id: string; w: number; h: number }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2={h}>
        <stop offset="0" stopColor="#b3832e" />
        <stop offset="0.28" stopColor="#e9c872" />
        <stop offset="0.46" stopColor="#fff3c4" />
        <stop offset="0.66" stopColor="#d6a746" />
        <stop offset="1" stopColor="#9a6d21" />
      </linearGradient>
    </defs>
  );
}

const f1 = (n: number) => n.toFixed(1);

type Cubic = [number, number, number, number, number, number, number, number];

/** Point and tangent angle (radians) on a cubic Bézier. */
function cubicAt(c: Cubic, t: number) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = c;
  const u = 1 - t;
  const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
  const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
  const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
  const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
  return { x, y, a: Math.atan2(dy, dx) };
}

/** Needles fanning from a curve, as one path string (a stroke of short lines). */
function needlePath(
  c: Cubic,
  count: number,
  from: number,
  to: number,
  spread: number,
  len: (t: number, i: number) => number
): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const t = from + ((to - from) * i) / (count - 1);
    const { x, y, a } = cubicAt(c, t);
    const l = len(t, i);
    for (const side of [-1, 1]) {
      const ang = a + side * spread;
      d += `M${f1(x)} ${f1(y)}l${f1(Math.cos(ang) * l)} ${f1(Math.sin(ang) * l)}`;
    }
  }
  return d;
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

/** Two scalloped holly leaves and a berry cluster, drawn around (0,0). */
function HollyShapes() {
  const leaf =
    "M0 0C2-4 4-3.4 6-5.4C7.4-7.4 9.4-5.4 11.4-6.4C13.6-7.4 15.6-4 19 0C15.6 4 13.6 7.4 11.4 6.4C9.4 5.4 7.4 7.4 6 5.4C4 3.4 2 4 0 0Z";
  return (
    <>
      <g transform="rotate(-152)">
        <path d={leaf} fill="var(--festive-pine)" />
        <path d="M1 0H16" stroke="var(--festive-pine-light)" strokeWidth="0.8" strokeLinecap="round" />
      </g>
      <g transform="rotate(-28)">
        <path d={leaf} fill="var(--festive-pine-light)" />
        <path d="M1 0H16" stroke="var(--festive-pine)" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
      </g>
      <circle cx="-2.7" cy="2.4" r="3.2" fill="var(--festive-red)" />
      <circle cx="2.7" cy="2.6" r="3.2" fill="var(--festive-red)" />
      <circle cx="0" cy="6.2" r="3.2" fill="var(--festive-red-deep)" />
      <circle cx="-3.6" cy="1.4" r="0.8" fill="#fff" opacity="0.75" />
      <circle cx="1.8" cy="1.6" r="0.8" fill="#fff" opacity="0.6" />
    </>
  );
}

/** Holly and berries: the little mark on holiday buttons. */
export function HollySprig({ className = "" }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 40 30" aria-hidden="true" focusable="false">
      <g transform="translate(20 17)">
        <HollyShapes />
      </g>
    </svg>
  );
}

/** Satin gift bow with a foil knot: sits on the basket and on the logo. */
export function GiftBow({ className = "" }: ArtProps) {
  const foil = useSvgId();
  return (
    <svg className={className} viewBox="0 0 36 24" aria-hidden="true" focusable="false">
      <FoilDefs id={foil} w={36} h={24} />
      <path d="M17 13 L9.5 23 L14 21.4 L17.4 23.2Z" fill="var(--festive-red-deep)" />
      <path d="M19 13 L26.5 23 L22 21.4 L18.6 23.2Z" fill="var(--festive-red-deep)" />
      <path
        d="M18 12.4C12 2.4 2.6 0.6 1.8 6.8C1.2 12.6 9.6 14.4 18 12.4Z"
        fill="var(--festive-red)"
        stroke={`url(#${foil})`}
        strokeWidth="0.9"
      />
      <path
        d="M18 12.4C24 2.4 33.4 0.6 34.2 6.8C34.8 12.6 26.4 14.4 18 12.4Z"
        fill="var(--festive-red)"
        stroke={`url(#${foil})`}
        strokeWidth="0.9"
      />
      <path d="M16 11.6C11.6 6.8 7.4 5.6 5.4 7" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M20 11.6C24.4 6.8 28.6 5.6 30.6 7" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.9" strokeLinecap="round" />
      <rect x="14.6" y="9.4" width="6.8" height="6.2" rx="2.2" fill={`url(#${foil})`} />
      <path d="M16.4 11H19.6" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

/** Four-point foil glint: the New Year counterpart of the bow. */
export function Glint({ className = "" }: ArtProps) {
  const foil = useSvgId();
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <FoilDefs id={foil} w={24} h={24} />
      <path
        d="M12 1C12.8 8 16 11.2 23 12C16 12.8 12.8 16 12 23C11.2 16 8 12.8 1 12C8 11.2 11.2 8 12 1Z"
        fill={`url(#${foil})`}
      />
    </svg>
  );
}

/** Hairline gold rule with a centred diamond: a quiet festive divider. */
export function Ornament({ className = "" }: ArtProps) {
  const id = useSvgId();
  return (
    <svg className={className} viewBox="0 0 160 14" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="160" y2="0">
          <stop offset="0" stopColor="#a8782a" stopOpacity="0" />
          <stop offset="0.35" stopColor="#b98a30" />
          <stop offset="0.5" stopColor="#d9a441" />
          <stop offset="0.65" stopColor="#b98a30" />
          <stop offset="1" stopColor="#a8782a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M2 7H66" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M94 7H158" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="71" cy="7" r="1.7" fill="#c8963a" />
      <circle cx="89" cy="7" r="1.7" fill="#c8963a" />
      <path d="M80 1L85.6 7L80 13L74.4 7Z" fill="#d9a441" stroke="#a8782a" strokeWidth="0.6" />
    </svg>
  );
}

/* ── Illustrations ────────────────────────────────────────────────────────── */

const BRANCH: Cubic = [8, 64, 52, 62, 100, 46, 152, 18];

const BRANCH_DARK = needlePath(BRANCH, 20, 0.05, 0.99, 0.95, (t) => 17 - 8 * t);
const BRANCH_LIGHT = needlePath(BRANCH, 19, 0.08, 0.97, 0.62, (t) => 13 - 6 * t);

/** Engraved fir sprig with a foil bauble and berries (Christmas). */
export function FirBranch({ className = "" }: ArtProps) {
  const foil = useSvgId();
  const mid = cubicAt(BRANCH, 0.5);
  const low = cubicAt(BRANCH, 0.28);
  return (
    <svg className={className} viewBox="0 0 160 90" aria-hidden="true" focusable="false">
      <FoilDefs id={foil} w={160} h={90} />
      <path
        d={`M${BRANCH[0]} ${BRANCH[1]}C${BRANCH[2]} ${BRANCH[3]} ${BRANCH[4]} ${BRANCH[5]} ${BRANCH[6]} ${BRANCH[7]}`}
        fill="none"
        stroke="var(--festive-bark)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d={BRANCH_DARK} fill="none" stroke="var(--festive-pine)" strokeWidth="2.3" strokeLinecap="round" />
      <path
        d={BRANCH_LIGHT}
        fill="none"
        stroke="var(--festive-pine-light)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* foil bauble on a thread */}
      <path d={`M${f1(low.x)} ${f1(low.y)}V${f1(low.y + 14)}`} stroke={`url(#${foil})`} strokeWidth="0.9" />
      <rect x={low.x - 2.6} y={low.y + 13} width="5.2" height="3.4" rx="1" fill={`url(#${foil})`} />
      <circle cx={low.x} cy={low.y + 24} r="8.2" fill={`url(#${foil})`} />
      <path
        d={`M${f1(low.x - 5)} ${f1(low.y + 21)}a6 6 0 0 1 4.6-4`}
        stroke="#fff"
        strokeOpacity="0.7"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      {/* berries tucked into the sprig */}
      <g transform={`translate(${f1(mid.x + 4)} ${f1(mid.y + 5)})`}>
        <circle cx="-3" cy="0" r="3.4" fill="var(--festive-red)" />
        <circle cx="3" cy="0.6" r="3.4" fill="var(--festive-red)" />
        <circle cx="0" cy="4.4" r="3.4" fill="var(--festive-red-deep)" />
        <circle cx="-4" cy="-1" r="0.9" fill="#fff" opacity="0.7" />
      </g>
    </svg>
  );
}

const BURST_RAYS = Array.from({ length: 16 }, (_, k) => {
  const ang = (k * Math.PI * 2) / 16;
  const long = k % 2 === 0;
  const r0 = 10;
  const r1 = long ? 33 : 22;
  return {
    d: `M${f1(60 + Math.cos(ang) * r0)} ${f1(42 + Math.sin(ang) * r0)}L${f1(60 + Math.cos(ang) * r1)} ${f1(42 + Math.sin(ang) * r1)}`,
    dot: [60 + Math.cos(ang) * (r1 + 4.6), 42 + Math.sin(ang) * (r1 + 4.6), long ? 1.9 : 1.2] as const,
  };
});

/** Engraved firework burst with glints (New Year). */
export function Sparkles({ className = "" }: ArtProps) {
  const foil = useSvgId();
  const glint = (x: number, y: number, r: number) =>
    `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
  return (
    <svg className={className} viewBox="0 0 120 84" aria-hidden="true" focusable="false">
      <FoilDefs id={foil} w={120} h={84} />
      <g stroke={`url(#${foil})`} strokeWidth="1.5" strokeLinecap="round" fill="none">
        {BURST_RAYS.map((ray, i) => (
          <path key={i} d={ray.d} />
        ))}
      </g>
      {BURST_RAYS.map((ray, i) => (
        <circle key={i} cx={ray.dot[0]} cy={ray.dot[1]} r={ray.dot[2]} fill={`url(#${foil})`} />
      ))}
      <path className="season-sparkle" d={glint(60, 42, 9)} fill={`url(#${foil})`} />
      {(
        [
          [12, 14, 6],
          [108, 70, 6.5],
          [104, 12, 4],
          [14, 68, 4],
        ] as const
      ).map(([x, y, r], i) => (
        <path
          key={i}
          className="season-sparkle"
          style={{ animationDelay: `${0.5 + i * 0.45}s` }}
          d={glint(x, y, r)}
          fill={`url(#${foil})`}
        />
      ))}
    </svg>
  );
}

/* ── Header garland ───────────────────────────────────────────────────────── */

const SWAG_W = 240;
const SWAG_H = 40;
const SWAG_COUNT = 12; // 2880px, centred and clipped to the viewport

const swagY = (t: number) => 2 + 40 * t * (1 - t);
const swagAngle = (t: number) => Math.atan2(40 * (1 - 2 * t), SWAG_W);

/** Needles along the sagging rope; identical for every swag, so computed once. */
const SWAG_NEEDLES_DARK = (() => {
  let d = "";
  const n = 30;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = t * SWAG_W;
    const y = swagY(t);
    const a = swagAngle(t);
    const l = 4.4 + (i % 3) * 1.1;
    for (const side of [-1, 1]) {
      const ang = a + side * 1.05;
      d += `M${f1(x)} ${f1(y)}l${f1(Math.cos(ang) * l)} ${f1(Math.sin(ang) * l)}`;
    }
  }
  return d;
})();
const SWAG_NEEDLES_LIGHT = (() => {
  let d = "";
  const n = 26;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.9) / (n + 0.8);
    const x = t * SWAG_W;
    const y = swagY(t);
    const a = swagAngle(t);
    const l = 3.2 + (i % 2) * 1.2;
    for (const side of [-1, 1]) {
      const ang = a + side * 0.62;
      d += `M${f1(x)} ${f1(y)}l${f1(Math.cos(ang) * l)} ${f1(Math.sin(ang) * l)}`;
    }
  }
  return d;
})();

const LIGHT_STOPS = [0.1, 0.24, 0.38, 0.62, 0.76, 0.9];
const BERRY_STOPS = [0.17, 0.31, 0.69, 0.83];

function GarlandSwag({ index, glow, foil }: { index: number; glow: string; foil: string }) {
  const bx = SWAG_W / 2;
  const by = swagY(0.5);
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
        className="season-garland-rope"
        d={`M0 2Q${SWAG_W / 2} 22 ${SWAG_W} 2`}
        fill="none"
        stroke="var(--festive-pine)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        className="season-garland-greens"
        d={SWAG_NEEDLES_DARK}
        fill="none"
        stroke="var(--festive-pine)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="season-garland-greens"
        d={SWAG_NEEDLES_LIGHT}
        fill="none"
        stroke="var(--festive-pine-light)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {BERRY_STOPS.map((t) => (
        <g key={t} className="season-garland-greens">
          <circle cx={t * SWAG_W} cy={swagY(t) + 1.2} r="2.1" fill="var(--festive-red)" />
          <circle cx={t * SWAG_W + 3.1} cy={swagY(t) + 2.4} r="1.7" fill="var(--festive-red-deep)" />
          <circle cx={t * SWAG_W - 0.7} cy={swagY(t) + 0.5} r="0.55" fill="#fff" opacity="0.7" />
        </g>
      ))}

      {LIGHT_STOPS.map((t, i) => {
        const x = t * SWAG_W;
        const y = swagY(t);
        const n = index * LIGHT_STOPS.length + i;
        const delay = `${((n * 0.43) % 3).toFixed(2)}s`;
        return (
          <g key={t} transform={`translate(${f1(x)} ${f1(y)})`}>
            <path d="M0 0V4" stroke="var(--festive-wire)" strokeWidth="0.9" />
            <circle
              className="season-glow"
              style={{ animationDelay: delay }}
              cx="0"
              cy="9"
              r="9"
              fill={`url(#${glow})`}
            />
            <rect x="-1.6" y="3.4" width="3.2" height="2.6" rx="0.8" fill="var(--festive-wire)" />
            <ellipse
              className={`season-bulb season-bulb--${n % 3}`}
              style={{ animationDelay: delay }}
              cx="0"
              cy="9"
              rx="2.7"
              ry="3.9"
            />
            <ellipse cx="-0.9" cy="7.6" rx="0.7" ry="1.2" fill="#fff" opacity="0.7" />
          </g>
        );
      })}

      {/* foil pendant at the sag, alternating with a deeper accent colour */}
      <g transform={`translate(${bx} ${f1(by)})`}>
        <path d="M0 0V8" stroke={`url(#${foil})`} strokeWidth="0.9" />
        <rect x="-2" y="7.4" width="4" height="2.6" rx="0.8" fill={`url(#${foil})`} />
        <circle
          className={index % 2 === 0 ? "season-bauble-gold" : "season-bauble-alt"}
          cx="0"
          cy="14.4"
          r="4.6"
          fill={index % 2 === 0 ? `url(#${foil})` : "var(--festive-bauble-alt)"}
        />
        {index % 2 === 1 && (
          <circle cx="0" cy="14.4" r="4.6" fill="none" stroke={`url(#${foil})`} strokeWidth="0.9" />
        )}
        <path d="M-2.6 12.8a3.4 3.4 0 0 1 2.6-2" stroke="#fff" strokeOpacity="0.75" strokeWidth="1" fill="none" strokeLinecap="round" />
      </g>

      {/* New Year: four-point foil stars replace the greenery */}
      {[0.3, 0.7].map((t) => (
        <path
          key={t}
          className="season-garland-stars season-sparkle"
          style={{ animationDelay: `${(index * 0.31 + t) % 2.4}s` }}
          d={`M${f1(t * SWAG_W)} ${f1(swagY(t) - 5)}Q${f1(t * SWAG_W)} ${f1(swagY(t))} ${f1(t * SWAG_W + 5)} ${f1(swagY(t))}Q${f1(t * SWAG_W)} ${f1(swagY(t))} ${f1(t * SWAG_W)} ${f1(swagY(t) + 5)}Q${f1(t * SWAG_W)} ${f1(swagY(t))} ${f1(t * SWAG_W - 5)} ${f1(swagY(t))}Q${f1(t * SWAG_W)} ${f1(swagY(t))} ${f1(t * SWAG_W)} ${f1(swagY(t) - 5)}Z`}
          fill={`url(#${foil})`}
        />
      ))}
    </svg>
  );
}

/**
 * Warm-white fairy lights on an evergreen swag, with foil pendants and berries.
 * A bow sits on the centre join; the strip is clipped to the viewport.
 */
export function Garland({ className = "" }: ArtProps) {
  const base = useSvgId();
  const glow = `${base}-glow`;
  const foil = `${base}-foil`;
  return (
    <div className={className} aria-hidden="true">
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden="true"
        focusable="false"
      >
        <FoilDefs id={foil} w={SWAG_W} h={SWAG_H} />
        <defs>
          <radialGradient id={glow}>
            <stop offset="0" stopColor="#ffd98a" stopOpacity="0.8" />
            <stop offset="0.45" stopColor="#ffd98a" stopOpacity="0.25" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {Array.from({ length: SWAG_COUNT }).map((_, i) => (
        <GarlandSwag key={i} index={i} glow={glow} foil={foil} />
      ))}
      <GiftBow className="season-garland-bow" />
    </div>
  );
}

/* ── Footer horizon: a paper-cut winter valley ────────────────────────────── */

/** A tiered fir with snow on each tier, base centred on (0,0). */
function FirTree({ x, y, s = 1, tone }: { x: number; y: number; s?: number; tone: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2.6" y="-9" width="5.2" height="9" fill={tone} />
      <path d="M0 -78L13 -52H5L19 -30H7L24 -9H-24L-7 -30H-19L-5 -52H-13Z" fill={tone} />
      <path d="M0 -78L6.4 -65.5L0 -62L-6.4 -65.5Z" fill="var(--festive-snow)" opacity="0.9" />
      <path d="M-13 -52L-9.4 -58L0 -55L9.4 -58L13 -52L5 -52L0 -50L-5 -52Z" fill="var(--festive-snow)" opacity="0.85" />
      <path d="M-19 -30L-15 -37L0 -33L15 -37L19 -30L7 -30L0 -27L-7 -30Z" fill="var(--festive-snow)" opacity="0.85" />
    </g>
  );
}

const FAR_TREES: Array<[number, number, number]> = [
  [70, 66, 0.34], [112, 62, 0.28], [326, 60, 0.3], [372, 64, 0.36],
  [560, 56, 0.32], [748, 58, 0.3], [930, 56, 0.34], [972, 59, 0.28],
  [1128, 52, 0.32], [1170, 54, 0.26],
];
const MID_TREES: Array<[number, number, number]> = [
  [34, 94, 0.52], [196, 86, 0.46], [248, 90, 0.56], [452, 84, 0.5],
  [640, 92, 0.54], [684, 90, 0.42], [992, 86, 0.5], [1058, 88, 0.44],
];

/**
 * Three paper layers (far hills, near hills with a lit cottage, then snow in the
 * footer's own colour so the scene settles straight into the page), framed by
 * deep-pine firs and a few foil stars.
 */
export function WinterHorizon({ className = "" }: ArtProps) {
  const foil = useSvgId();
  const lights: Array<[number, number]> = [
    [1100, 96], [1110, 84], [1098, 76], [1112, 66], [1102, 58], [1110, 50],
  ];
  return (
    <svg
      className={className}
      viewBox="0 0 1200 130"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <FoilDefs id={foil} w={1200} h={130} />

      {/* foil stars in the sky */}
      {(
        [
          [210, 30, 7],
          [468, 18, 5],
          [868, 26, 8],
          [1010, 12, 4.5],
        ] as const
      ).map(([x, y, r], i) => (
        <path
          key={i}
          className="season-star"
          style={{ animationDelay: `${i * 0.6}s` }}
          d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
          fill="var(--festive-gold)"
        />
      ))}

      {/* New Year: a slow firework over the valley */}
      <g transform="translate(640 30)">
        <g className="season-horizon-firework">
        {Array.from({ length: 12 }).map((_, k) => {
          const a = (k * Math.PI * 2) / 12;
          const long = k % 2 === 0;
          const r0 = 5;
          const r1 = long ? 19 : 13;
          return (
            <g key={k}>
              <path
                d={`M${f1(Math.cos(a) * r0)} ${f1(Math.sin(a) * r0)}L${f1(Math.cos(a) * r1)} ${f1(Math.sin(a) * r1)}`}
                stroke="var(--festive-gold)"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle cx={Math.cos(a) * (r1 + 3.2)} cy={Math.sin(a) * (r1 + 3.2)} r={long ? 1.3 : 0.9} fill="var(--festive-gold)" />
            </g>
          );
        })}
        </g>
      </g>

      {/* far hills */}
      <path
        d="M0 74C150 50 300 66 450 56C600 46 720 70 880 54C1020 42 1120 60 1200 52V130H0Z"
        fill="var(--festive-hill-far)"
        style={{ filter: "drop-shadow(0 -1.5px 1.5px rgb(40 55 45 / 0.14))" }}
      />
      {FAR_TREES.map(([x, y, s], i) => (
        <FirTree key={i} x={x} y={y} s={s} tone="var(--festive-tree-far)" />
      ))}

      {/* near hills + cottage */}
      <path
        d="M0 90C140 72 260 86 400 78C560 68 640 90 820 82C980 74 1090 86 1200 76V130H0Z"
        fill="var(--festive-hill-mid)"
        style={{ filter: "drop-shadow(0 -1.5px 1.5px rgb(40 55 45 / 0.14))" }}
      />
      {MID_TREES.map(([x, y, s], i) => (
        <FirTree key={i} x={x} y={y} s={s} tone="var(--festive-tree-mid)" />
      ))}
      <g transform="translate(800 88)">
        <rect x="-26" y="-26" width="52" height="26" fill="var(--festive-cottage)" />
        <path d="M-32 -24L0 -50L32 -24Z" fill="var(--festive-cottage-roof)" />
        <path d="M-32 -24L0 -50L32 -24L26 -24L0 -43L-26 -24Z" fill="var(--festive-snow)" />
        <rect x="14" y="-56" width="7" height="14" fill="var(--festive-cottage)" />
        <rect x="12.5" y="-58.5" width="10" height="3.4" rx="1" fill="var(--festive-snow)" />
        <g className="season-window">
          <rect x="-19" y="-19" width="10" height="11" rx="1" fill="var(--festive-window)" />
          <rect x="9" y="-19" width="10" height="11" rx="1" fill="var(--festive-window)" />
          <path d="M-14 -19V-8M-19 -13.5H-9M14 -19V-8M9 -13.5H19" stroke="var(--festive-cottage)" strokeWidth="0.9" />
        </g>
        <path d="M-6 0V-13a6 6 0 0 1 12 0V0Z" fill="var(--festive-cottage-roof)" />
        <circle className="season-smoke" cx="18" cy="-64" r="3.2" fill="var(--festive-snow)" opacity="0.55" />
        <circle className="season-smoke season-smoke--b" cx="21" cy="-72" r="4.2" fill="var(--festive-snow)" opacity="0.4" />
      </g>

      {/* snow underfoot (same colour as the footer) */}
      <path
        d="M0 106C180 94 320 110 520 102C720 94 860 112 1040 102C1120 98 1170 102 1200 100V130H0Z"
        fill="var(--festive-ground)"
      />
      <path
        d="M0 106C180 94 320 110 520 102C720 94 860 112 1040 102C1120 98 1170 102 1200 100"
        fill="none"
        stroke="var(--festive-snow)"
        strokeWidth="1.6"
        opacity="0.9"
      />

      {/* framing firs, one strung with lights */}
      <FirTree x={62} y={114} s={1.05} tone="var(--festive-pine)" />
      <FirTree x={128} y={116} s={0.7} tone="var(--festive-pine-light)" />
      <FirTree x={1112} y={112} s={1.12} tone="var(--festive-pine)" />
      <FirTree x={1166} y={116} s={0.72} tone="var(--festive-pine-light)" />
      {lights.map(([x, y], i) => (
        <circle
          key={i}
          className="season-glow"
          style={{ animationDelay: `${i * 0.37}s` }}
          cx={x + (i % 2 ? 4 : -6)}
          cy={y}
          r="2"
          fill="var(--festive-window)"
        />
      ))}
      <path
        className="season-star"
        d="M1112 14Q1112 24 1122 24Q1112 24 1112 34Q1112 24 1102 24Q1112 24 1112 14Z"
        fill="var(--festive-gold)"
        stroke="#fff3c4"
        strokeWidth="0.6"
      />
    </svg>
  );
}

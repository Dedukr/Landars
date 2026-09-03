type FestivalSectionDividerProps = {
  label?: string;
  /** Category/divider order: odd/even side + unique motif. */
  index?: number;
};

type MotifId = "wheat" | "mill" | "fence" | "roof" | "grass";

const MOTIFS: MotifId[] = ["wheat", "mill", "fence", "roof", "grass"];

function TinyWheat() {
  return (
    <svg viewBox="0 0 20 28" width="18" height="24" focusable="false" aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M10 26 V6" strokeWidth="1.1" />
        {[0, 1, 2, 3].map((i) => {
          const y = 8 + i * 4;
          return (
            <g key={i} opacity={0.85 - i * 0.08}>
              <path d={`M10 ${y} l-5 -2`} strokeWidth="1" />
              <path d={`M10 ${y} l5 -2`} strokeWidth="1" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function TinyMill() {
  return (
    <svg viewBox="0 0 22 28" width="18" height="24" focusable="false" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round">
        <path d="M11 26 V14" />
        <path d="M8 26 h6" />
        <circle cx="11" cy="12" r="1.6" />
        <path d="M11 12 L4 6 M11 12 L18 6 M11 12 L5 19 M11 12 L17 18" opacity="0.85" />
      </g>
    </svg>
  );
}

function TinyFence() {
  return (
    <svg viewBox="0 0 28 18" width="22" height="14" focusable="false" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round">
        <path d="M3 4 V15 M9 3 V15 M15 4 V15 M21 3 V15 M26 5 V15" />
        <path d="M2 7 H27 M2 11 H27" />
      </g>
    </svg>
  );
}

function TinyRoof() {
  return (
    <svg viewBox="0 0 26 20" width="20" height="16" focusable="false" aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12 L13 3 L23 12" />
        <path d="M6 12 V18 H20 V12" />
      </g>
    </svg>
  );
}

function TinyGrass() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="20" focusable="false" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round">
        <path d="M6 20 C5 12 3 8 2 4" />
        <path d="M10 21 C11 12 10 7 11 3" />
        <path d="M14 20 C16 13 17 9 18 5" />
      </g>
    </svg>
  );
}

function DividerMotif({ id }: { id: MotifId }) {
  switch (id) {
    case "mill":
      return <TinyMill />;
    case "fence":
      return <TinyFence />;
    case "roof":
      return <TinyRoof />;
    case "grass":
      return <TinyGrass />;
    case "wheat":
    default:
      return <TinyWheat />;
  }
}

/** Category divider: two fading beige lines + wheat-seed center. */
export function FestivalSectionDivider({
  label,
  index = 0,
}: FestivalSectionDividerProps) {
  // First divider → right, second → left, then alternate.
  const side = index % 2 === 0 ? "right" : "left";
  const motif = MOTIFS[index % MOTIFS.length];

  return (
    <div
      className="festival-menu-section-divider"
      aria-hidden={label ? undefined : true}
    >
      <span
        className={`festival-menu-section-divider-deco festival-menu-section-divider-deco--${side}`}
      >
        <DividerMotif id={motif} />
      </span>
      <span className="festival-menu-section-divider-line" />
      <span className="festival-menu-section-divider-mark">
        <svg viewBox="0 0 24 12" width="24" height="12" focusable="false">
          <path
            d="M2 6h6.5M15.5 6H22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.55"
          />
          <circle
            cx="12"
            cy="6"
            r="2.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
          />
          <circle cx="12" cy="6" r="0.7" fill="currentColor" />
        </svg>
      </span>
      <span className="festival-menu-section-divider-line" />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

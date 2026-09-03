/** Side rails + village horizon — decorative only, never in reading area. */
export function FestivalMenuDecoration() {
  return (
    <div className="festival-menu-decoration" aria-hidden="true">
      <div className="festival-menu-decoration-rail festival-menu-decoration-rail--left">
        <LeftDecorationBlock />
        <LeftDecorationBlock />
        <LeftDecorationBlock />
      </div>
      <div className="festival-menu-decoration-rail festival-menu-decoration-rail--right">
        <RightDecorationBlock />
        <RightDecorationBlock />
      </div>
    </div>
  );
}

function LeftDecorationBlock() {
  return (
    <div className="festival-menu-decoration-block">
      <WheatCluster className="festival-menu-decoration-cluster festival-menu-decoration-cluster--a" />
      <PartialWindmill className="festival-menu-decoration-cluster festival-menu-decoration-cluster--b" />
      <GrassTuft className="festival-menu-decoration-cluster festival-menu-decoration-cluster--c" />
    </div>
  );
}

function RightDecorationBlock() {
  return (
    <div className="festival-menu-decoration-block">
      <WheatCluster
        className="festival-menu-decoration-cluster festival-menu-decoration-cluster--d"
        flip
      />
      <FenceFragment className="festival-menu-decoration-cluster festival-menu-decoration-cluster--e" />
      <RoofPeak className="festival-menu-decoration-cluster festival-menu-decoration-cluster--f" />
    </div>
  );
}

export function FestivalWheatSprig({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`festival-menu-wheat-sprig ${className}`.trim()}
      viewBox="0 0 48 72"
      width="36"
      height="54"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M24 68 V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const y = 14 + i * 6.2;
        const len = 11 - i * 0.55;
        return (
          <g key={i}>
            <line
              x1="24"
              y1={y}
              x2={24 - len}
              y2={y - 3.5}
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.72"
            />
            <line
              x1="24"
              y1={y}
              x2={24 + len}
              y2={y - 3.5}
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.72"
            />
            <circle
              cx={24 - len}
              cy={y - 3.5}
              r="1.35"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            <circle
              cx={24 + len}
              cy={y - 3.5}
              r="1.35"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </g>
        );
      })}
    </svg>
  );
}

function WheatCluster({
  className = "",
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 140"
      width="80"
      height="140"
      focusable="false"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M28 132 V48" strokeWidth="1.2" />
        <path d="M42 128 V36" strokeWidth="1.2" />
        <path d="M56 130 V52" strokeWidth="1.15" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} opacity={0.85 - i * 0.06}>
            <path d={`M42 ${40 + i * 10} l-9 -4`} strokeWidth="1" />
            <path d={`M42 ${40 + i * 10} l9 -4`} strokeWidth="1" />
            <circle cx={33} cy={36 + i * 10} r="1.4" />
            <circle cx={51} cy={36 + i * 10} r="1.4" />
          </g>
        ))}
        <path
          d="M28 70 l-7 -5 M28 82 l-7 -5 M28 94 l-6 -4"
          strokeWidth="1"
          opacity="0.7"
        />
        <path
          d="M56 74 l7 -5 M56 86 l7 -5 M56 98 l6 -4"
          strokeWidth="1"
          opacity="0.7"
        />
      </g>
    </svg>
  );
}

function PartialWindmill({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 90 120"
      width="90"
      height="120"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      >
        <path d="M44 118 V58" />
        <path d="M36 118 h16" />
        <circle cx="44" cy="52" r="3.5" />
        <path
          d="M44 52 L18 28 M44 52 L70 28 M44 52 L20 78 M44 52 L68 76"
          opacity="0.85"
        />
        <path
          d="M44 52 L30 18 M44 52 L58 18 M44 52 L26 70 M44 52 L62 70"
          opacity="0.55"
        />
      </g>
    </svg>
  );
}

function GrassTuft({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 90"
      width="60"
      height="90"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        <path d="M18 82 C16 54 8 36 6 18" />
        <path d="M28 84 C30 50 26 32 30 12" />
        <path d="M38 82 C42 56 48 38 52 20" />
        <path d="M22 84 C20 62 14 48 12 34" opacity="0.7" />
        <path d="M34 84 C36 60 40 46 44 30" opacity="0.7" />
      </g>
    </svg>
  );
}

function FenceFragment({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 70"
      width="100"
      height="70"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      >
        <path d="M8 18 V58 M28 14 V58 M48 18 V58 M68 14 V58 M88 20 V58" />
        <path d="M6 28 H92 M6 44 H92" />
      </g>
    </svg>
  );
}

function RoofPeak({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 90 70"
      width="90"
      height="70"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 42 L45 10 L82 42" />
        <path d="M18 42 V60 H72 V42" />
        <path d="M40 60 V46 H50 V60" opacity="0.8" />
        <rect x="26" y="48" width="8" height="8" opacity="0.75" />
        <rect x="56" y="48" width="8" height="8" opacity="0.75" />
      </g>
    </svg>
  );
}

export function FestivalVillageHorizon({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      className={`festival-menu-village-horizon ${className}`.trim()}
      viewBox="0 0 720 88"
      width="720"
      height="88"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 72 H712" opacity="0.55" />
        {/* Left plants */}
        <path
          d="M36 72 V48 M30 52 l-6 -10 M36 50 l0 -14 M42 52 l6 -10"
          opacity="0.85"
        />
        <circle cx="24" cy="40" r="2.2" />
        <circle cx="36" cy="34" r="2.2" />
        <circle cx="48" cy="40" r="2.2" />
        <path
          d="M68 72 V50 M62 54 l-5 -9 M68 52 l0 -12 M74 54 l5 -9"
          opacity="0.8"
        />
        <circle cx="57" cy="43" r="2" />
        <circle cx="68" cy="38" r="2" />
        <circle cx="79" cy="43" r="2" />
        {/* Windmill */}
        <path d="M130 72 V42" />
        <circle cx="130" cy="38" r="2.8" />
        <path
          d="M130 38 L112 22 M130 38 L148 22 M130 38 L114 56 M130 38 L146 54"
          opacity="0.9"
        />
        {/* House */}
        <path d="M200 72 V48 H260 V72" />
        <path d="M194 48 L230 24 L266 48" />
        <path d="M224 72 V56 H236 V72" opacity="0.85" />
        <rect x="208" y="54" width="8" height="8" />
        <rect x="244" y="54" width="8" height="8" />
        {/* Fence */}
        <path d="M290 72 V50 M318 72 V48 M346 72 V50 M374 72 V48 M402 72 V50 M430 72 V48 M458 72 V52" />
        <path d="M286 56 H462 M286 64 H462" />
        {/* Right plants */}
        <path
          d="M620 72 V50 M614 54 l-5 -9 M620 52 l0 -12 M626 54 l5 -9"
          opacity="0.8"
        />
        <circle cx="609" cy="43" r="2" />
        <circle cx="620" cy="38" r="2" />
        <circle cx="631" cy="43" r="2" />
        <path
          d="M660 72 V48 M654 52 l-6 -10 M660 50 l0 -14 M666 52 l6 -10"
          opacity="0.85"
        />
        <circle cx="648" cy="40" r="2.2" />
        <circle cx="660" cy="34" r="2.2" />
        <circle cx="672" cy="40" r="2.2" />
      </g>
    </svg>
  );
}

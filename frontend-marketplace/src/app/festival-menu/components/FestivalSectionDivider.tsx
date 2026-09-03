type FestivalSectionDividerProps = {
  label?: string;
};

/** Category divider: two fading beige lines + wheat-seed center. */
export function FestivalSectionDivider({ label }: FestivalSectionDividerProps) {
  return (
    <div className="festival-menu-section-divider" aria-hidden={label ? undefined : true}>
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
          <circle cx="12" cy="6" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="12" cy="6" r="0.7" fill="currentColor" />
        </svg>
      </span>
      <span className="festival-menu-section-divider-line" />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

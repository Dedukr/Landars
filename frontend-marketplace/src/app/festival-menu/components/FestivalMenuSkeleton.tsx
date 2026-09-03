export function FestivalMenuSkeleton() {
  return (
    <div className="festival-menu-skeleton-wrap" aria-hidden>
      <div className="festival-menu-skeleton-nav">
        {Array.from({ length: 4 }).map((_, index) => (
          <span
            key={index}
            className="festival-menu-skeleton festival-menu-skeleton-pill"
          />
        ))}
      </div>
      <ul className="festival-menu-card-grid festival-menu-skeleton-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <li key={index} className="festival-menu-skeleton-card">
            <span className="festival-menu-skeleton festival-menu-skeleton-card-media" />
            <div className="festival-menu-skeleton-card-body">
              <span
                className="festival-menu-skeleton"
                style={{ height: "1.25rem", width: `${58 + (index % 3) * 8}%` }}
              />
              <span
                className="festival-menu-skeleton"
                style={{ height: "0.8125rem", width: "28%" }}
              />
              <span
                className="festival-menu-skeleton"
                style={{ height: "0.875rem", width: "92%" }}
              />
              <span
                className="festival-menu-skeleton"
                style={{ height: "0.875rem", width: "74%" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FestivalMenuSkeleton() {
  return (
    <div className="festival-menu-skeleton-wrap" aria-hidden>
      <div className="festival-menu-skeleton-nav">
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className="festival-menu-skeleton festival-menu-skeleton-pill" />
        ))}
      </div>
      <ul className="festival-menu-entry-list">
        {Array.from({ length: 4 }).map((_, index) => (
          <li
            key={index}
            className={`festival-menu-skeleton-entry${
              index % 2 === 1 ? " festival-menu-skeleton-entry--image-right" : ""
            }`}
          >
            <span className="festival-menu-skeleton festival-menu-skeleton-entry-media" />
            <div className="festival-menu-skeleton-entry-body">
              <span
                className="festival-menu-skeleton"
                style={{ height: "1rem", width: `${55 + (index % 3) * 10}%` }}
              />
              <span
                className="festival-menu-skeleton"
                style={{ height: "0.8125rem", width: "30%" }}
              />
              <span
                className="festival-menu-skeleton"
                style={{ height: "0.875rem", width: "85%" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

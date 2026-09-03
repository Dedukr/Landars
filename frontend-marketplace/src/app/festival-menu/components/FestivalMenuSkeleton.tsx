import { FestivalSectionDivider } from "./FestivalSectionDivider";

const NAV_PILL_WIDTHS = ["5.5rem", "4.75rem", "5.25rem", "4.5rem"];

type SkeletonCard = {
  name: number;
};

const SKELETON_SECTIONS: {
  titleWidth: string;
  withAdditions: boolean;
  cards: SkeletonCard[];
}[] = [
  {
    titleWidth: "7.5rem",
    withAdditions: true,
    cards: [{ name: 62 }, { name: 54 }, { name: 70 }, { name: 48 }],
  },
  {
    titleWidth: "6.25rem",
    withAdditions: false,
    cards: [{ name: 44 }, { name: 58 }],
  },
];

/** Category nav placeholder — sits where FestivalCategoryNav renders. */
export function FestivalMenuSkeletonNav() {
  return (
    <div className="festival-menu-nav-slot" aria-hidden>
      <nav className="festival-menu-nav festival-menu-nav--skeleton">
        <div className="festival-menu-nav-inner">
          {NAV_PILL_WIDTHS.map((width, index) => (
            <span
              key={index}
              className="festival-menu-skeleton festival-menu-skeleton-pill"
              style={{ width, flexBasis: width }}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Main-content placeholder — mirrors category sections + product card grids. */
export function FestivalMenuSkeleton() {
  return (
    <div className="festival-menu-sections" aria-hidden>
      {SKELETON_SECTIONS.map((section, sectionIndex) => (
        <section
          key={sectionIndex}
          className="festival-menu-section festival-menu-section--skeleton"
        >
          <div className="festival-menu-section-heading">
            <div className="festival-menu-section-title-row">
              <span
                className="festival-menu-skeleton festival-menu-skeleton-title"
                style={{ width: section.titleWidth }}
              />
            </div>
            <FestivalSectionDivider index={sectionIndex} />
            {section.withAdditions ? (
              <div className="festival-menu-category-additions festival-menu-category-additions--skeleton">
                <ul className="festival-menu-category-additions-summary">
                  {[0, 1, 2].map((index) => (
                    <li key={index}>
                      <span
                        className="festival-menu-skeleton festival-menu-skeleton-addition"
                        style={{ width: `${5.5 + (index % 3) * 0.75}rem` }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <ul className="festival-menu-card-grid">
            {section.cards.map((card, cardIndex) => (
              <li key={cardIndex}>
                <div className="festival-menu-skeleton-card">
                  <span className="festival-menu-skeleton festival-menu-skeleton-card-media" />
                  <div className="festival-menu-skeleton-card-body">
                    <div className="festival-menu-skeleton-card-headline">
                      <span
                        className="festival-menu-skeleton"
                        style={{
                          height: "1.25rem",
                          width: `${card.name}%`,
                        }}
                      />
                      <span
                        className="festival-menu-skeleton"
                        style={{ height: "1.125rem", width: "3.25rem" }}
                      />
                    </div>
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
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

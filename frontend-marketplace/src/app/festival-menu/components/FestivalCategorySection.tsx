import type { FestivalMenuCategory } from "@/lib/festivalMenuApi";
import {
  categorySectionId,
  collectCategoryAdditionGroups,
  nonDrinkAdditionGroups,
} from "../utils";
import { FestivalCategoryAdditions } from "./FestivalCategoryAdditions";
import { FestivalMenuEntry } from "./FestivalMenuEntry";
import { FestivalSectionDivider } from "./FestivalSectionDivider";

type FestivalCategorySectionProps = {
  category: FestivalMenuCategory;
  showDrinksIncluded?: boolean;
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
  /** Absolute product index offset for eager-loading the first photos. */
  imagePriorityStart?: number;
};

export function FestivalCategorySection({
  category,
  showDrinksIncluded = false,
  brokenImages,
  onImageError,
  imagePriorityStart = 0,
}: FestivalCategorySectionProps) {
  const sectionId = categorySectionId(category.name);
  const additionGroups = nonDrinkAdditionGroups(
    collectCategoryAdditionGroups(category.products)
  );

  if (category.products.length === 0) {
    return (
      <section
        id={sectionId}
        className="festival-menu-section"
        aria-labelledby={`${sectionId}-title`}
      >
        <div className="festival-menu-section-heading">
          <h2 id={`${sectionId}-title`} className="festival-menu-section-title">
            {category.name}
          </h2>
          <FestivalSectionDivider />
        </div>
        <div className="festival-menu-state" role="status">
          <p>No items in this category right now.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      id={sectionId}
      className="festival-menu-section"
      aria-labelledby={`${sectionId}-title`}
    >
      <div className="festival-menu-section-heading">
        <div className="festival-menu-section-title-row">
          <h2 id={`${sectionId}-title`} className="festival-menu-section-title">
            {category.name}
          </h2>
          {showDrinksIncluded ? (
            <span className="festival-menu-section-included">Drinks included</span>
          ) : null}
        </div>
        <FestivalSectionDivider />
        <FestivalCategoryAdditions
          categoryName={category.name}
          groups={additionGroups}
        />
      </div>

      <ul
        className="festival-menu-card-grid"
        aria-label={`${category.name} menu items`}
      >
        {category.products.map((product, index) => (
          <li key={product.name}>
            <FestivalMenuEntry
              product={product}
              brokenImages={brokenImages}
              onImageError={onImageError}
              priority={imagePriorityStart + index < 2}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

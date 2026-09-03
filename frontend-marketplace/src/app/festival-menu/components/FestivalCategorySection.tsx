import type { FestivalMenuCategory } from "@/lib/festivalMenuApi";
import {
  categorySectionId,
  collectCategoryAdditionGroups,
  entryImageSide,
  nonDrinkAdditionGroups,
  partitionCategoryProducts,
} from "../utils";
import { FestivalCategoryAdditions } from "./FestivalCategoryAdditions";
import { FestivalMenuEntry, FestivalMenuEntryGroup } from "./FestivalMenuEntry";

type FestivalCategorySectionProps = {
  category: FestivalMenuCategory;
  showDrinksIncluded?: boolean;
  brokenImages: Record<string, boolean>;
  onImageError: (key: string) => void;
};

export function FestivalCategorySection({
  category,
  showDrinksIncluded = false,
  brokenImages,
  onImageError,
}: FestivalCategorySectionProps) {
  const sectionId = categorySectionId(category.name);
  const additionGroups = nonDrinkAdditionGroups(
    collectCategoryAdditionGroups(category.products)
  );
  const { simpleProducts, fillingProducts } = partitionCategoryProducts(
    category.products
  );

  let entryIndex = 0;

  if (category.products.length === 0) {
    return (
      <section
        id={sectionId}
        className="festival-menu-section"
        aria-labelledby={`${sectionId}-title`}
      >
        <h2 id={`${sectionId}-title`} className="festival-menu-section-title">
          {category.name}
        </h2>
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
      <div className="festival-menu-section-intro">
        <div className="festival-menu-section-title-row">
          <h2 id={`${sectionId}-title`} className="festival-menu-section-title">
            {category.name}
          </h2>
          {showDrinksIncluded ? (
            <span className="festival-menu-section-included">Drinks included</span>
          ) : null}
        </div>

        <FestivalCategoryAdditions
          categoryName={category.name}
          groups={additionGroups}
        />
      </div>

      {simpleProducts.length > 0 ? (
        <ul
          className="festival-menu-entry-list festival-menu-simple-products"
          aria-label={`${category.name} menu items`}
        >
          {simpleProducts.map((product) => {
            const imageSide = entryImageSide(entryIndex);
            entryIndex += 1;
            return (
              <li key={product.name}>
                <FestivalMenuEntry
                  product={product}
                  imageSide={imageSide}
                  brokenImages={brokenImages}
                  onImageError={onImageError}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      {fillingProducts.length > 0 ? (
        <div className="festival-menu-entry-groups">
          {fillingProducts.map((product) => (
            <FestivalMenuEntryGroup
              key={product.name}
              product={product}
              brokenImages={brokenImages}
              onImageError={onImageError}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

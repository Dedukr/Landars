import { formatCategoryAdditionSummary, type OptionCategory } from "../utils";
import type { FestivalMenuAddition } from "@/lib/festivalMenuApi";

type FestivalCategoryAdditionsProps = {
  categoryName: string;
  groups: OptionCategory<FestivalMenuAddition>[];
};

/** Slim ruled information band — not a filled promo banner. */
export function FestivalCategoryAdditions({
  categoryName,
  groups,
}: FestivalCategoryAdditionsProps) {
  if (groups.length === 0) return null;

  return (
    <aside
      className="festival-menu-category-additions"
      aria-label={`${categoryName} add-ons`}
    >
      <ul className="festival-menu-category-additions-summary">
        {groups.map((group) => (
          <li key={group.label}>{formatCategoryAdditionSummary(group.label)}</li>
        ))}
      </ul>
    </aside>
  );
}

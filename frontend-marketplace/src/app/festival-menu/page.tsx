"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countMenuItems,
  fetchFestivalMenu,
  type FestivalMenuResponse,
} from "@/lib/festivalMenuApi";
import { isMealsCategory, menuHasDrinkAdditions } from "./utils";
import { FestivalCategoryNav } from "./components/FestivalCategoryNav";
import { FestivalCategorySection } from "./components/FestivalCategorySection";
import { FestivalMenuDecoration } from "./components/FestivalMenuDecoration";
import { FestivalMenuFooter } from "./components/FestivalMenuFooter";
import { FestivalMenuHeader } from "./components/FestivalMenuHeader";
import {
  FestivalMenuSkeleton,
  FestivalMenuSkeletonNav,
} from "./components/FestivalMenuSkeleton";
import {
  FestivalMenuEmptyState,
  FestivalMenuErrorState,
} from "./components/FestivalMenuStates";
import "./festival-menu.css";

export default function FestivalMenuPage() {
  const [menu, setMenu] = useState<FestivalMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFestivalMenu();
      setMenu(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the festival menu.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => menu?.categories ?? [],
    [menu?.categories],
  );
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products),
    [categories],
  );
  const drinksIncludedWithMeals = useMemo(
    () => menuHasDrinkAdditions(allProducts),
    [allProducts],
  );
  const itemCount = useMemo(
    () =>
      categories.reduce((sum, cat) => sum + countMenuItems(cat.products), 0),
    [categories],
  );

  const handleImageError = useCallback((key: string) => {
    setBrokenImages((prev) => ({ ...prev, [key]: true }));
  }, []);

  const categoryImageOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const category of categories) {
      offsets.push(running);
      running += category.products.length;
    }
    return offsets;
  }, [categories]);

  return (
    <div className="festival-menu-page">
      <FestivalMenuDecoration />

      <div className="festival-menu-sheet">
        <FestivalMenuHeader includedMealOffer={menu?.included_meal_offer} />

        {loading ? (
          <FestivalMenuSkeletonNav />
        ) : !error && categories.length > 0 ? (
          <FestivalCategoryNav categories={categories} />
        ) : null}

        <main className="festival-menu-main">
          {loading ? (
            <>
              <p className="sr-only" role="status" aria-live="polite">
                Loading festival menu…
              </p>
              <FestivalMenuSkeleton />
            </>
          ) : error ? (
            <FestivalMenuErrorState
              message={error}
              onRetry={() => void load()}
            />
          ) : itemCount === 0 ? (
            <FestivalMenuEmptyState />
          ) : (
            <div className="festival-menu-sections">
              {categories.map((category, catIndex) => (
                <FestivalCategorySection
                  key={category.name}
                  category={category}
                  showDrinksIncluded={
                    drinksIncludedWithMeals && isMealsCategory(category.name)
                  }
                  brokenImages={brokenImages}
                  onImageError={handleImageError}
                  imagePriorityStart={categoryImageOffsets[catIndex] ?? 0}
                />
              ))}
            </div>
          )}
        </main>

        <FestivalMenuFooter />
      </div>
    </div>
  );
}

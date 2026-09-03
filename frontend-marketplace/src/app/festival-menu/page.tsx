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
import { FestivalMenuHeader } from "./components/FestivalMenuHeader";
import { FestivalMenuSkeleton } from "./components/FestivalMenuSkeleton";
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
        err instanceof Error ? err.message : "Could not load the festival menu."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = menu?.categories ?? [];
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products),
    [categories]
  );
  const drinksIncludedWithMeals = useMemo(
    () => menuHasDrinkAdditions(allProducts),
    [allProducts]
  );
  const itemCount = useMemo(
    () =>
      categories.reduce((sum, cat) => sum + countMenuItems(cat.products), 0),
    [categories]
  );

  const handleImageError = useCallback((key: string) => {
    setBrokenImages((prev) => ({ ...prev, [key]: true }));
  }, []);

  return (
    <div className="festival-menu-page">
      <FestivalMenuHeader includedMealOffer={menu?.included_meal_offer} />

      {!loading && !error && categories.length > 0 ? (
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
          <FestivalMenuErrorState message={error} onRetry={() => void load()} />
        ) : itemCount === 0 ? (
          <FestivalMenuEmptyState />
        ) : (
          <div className="festival-menu-sections">
            {categories.map((category) => (
              <FestivalCategorySection
                key={category.name}
                category={category}
                showDrinksIncluded={
                  drinksIncludedWithMeals && isMealsCategory(category.name)
                }
                brokenImages={brokenImages}
                onImageError={handleImageError}
              />
            ))}
          </div>
        )}
      </main>

      <p className="festival-menu-footer-note">
        Order at the festival counter — we&apos;ll prepare it fresh for you.
      </p>
    </div>
  );
}

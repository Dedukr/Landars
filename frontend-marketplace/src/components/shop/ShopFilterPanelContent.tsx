"use client";

import React, { useState, useEffect } from "react";
import { type ShopListingFilters, SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";
import { Button } from "@/components/ui/Button";

export interface ShopCategoryRecord {
  id: number;
  name: string;
  parent?: number | null;
}

interface ShopFilterPanelContentProps {
  filters: ShopListingFilters;
  setFilters: React.Dispatch<React.SetStateAction<ShopListingFilters>>;
  categories: ShopCategoryRecord[];
  categoriesLoading: boolean;
}

export function ShopFilterPanelContent({
  filters,
  setFilters,
  categories,
  categoriesLoading,
}: ShopFilterPanelContentProps) {
  const [collapseCategory, setCollapseCategory] = useState(true);
  const [collapsePrice, setCollapsePrice] = useState(true);
  const [minStr, setMinStr] = useState(
    filters.price[0] > 0 ? String(filters.price[0]) : ""
  );
  const [maxStr, setMaxStr] = useState(
    filters.price[1] < SHOP_PRICE_MAX_UNLIMITED ? String(filters.price[1]) : ""
  );

  useEffect(() => {
    setMinStr(filters.price[0] > 0 ? String(filters.price[0]) : "");
    setMaxStr(
      filters.price[1] < SHOP_PRICE_MAX_UNLIMITED ? String(filters.price[1]) : ""
    );
  }, [filters.price]);

  const categoryTree: { [parentId: number]: ShopCategoryRecord[] } = {};
  categories.forEach((cat) => {
    if (cat.parent == null) return;
    if (!categoryTree[cat.parent]) categoryTree[cat.parent] = [];
    categoryTree[cat.parent].push(cat);
  });
  const rootCategories = categories.filter((cat) => cat.parent == null);

  function handleCategoryTreeChange(cat: ShopCategoryRecord, isChecked: boolean) {
    const children = categoryTree[cat.id] || [];
    const childIds = children.map((c) => c.id);
    let newCategories = [...filters.categories];

    if (childIds.length > 0) {
      if (isChecked) {
        newCategories = newCategories.filter((id) => !childIds.includes(id));
      } else {
        newCategories = Array.from(new Set([...newCategories, ...childIds]));
      }
    } else {
      if (isChecked) {
        newCategories = newCategories.filter((id) => id !== cat.id);
      } else {
        newCategories = Array.from(new Set([...newCategories, cat.id]));
      }
    }
    setFilters((prev) => ({ ...prev, categories: newCategories }));
  }

  function renderCategoryTree(parentId: number, level: number = 0) {
    const children = categoryTree[parentId] || [];
    const sorted = [...children].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.map((cat) => {
      const subChildren = categoryTree[cat.id];
      const childIds = subChildren ? subChildren.map((c) => c.id) : [];
      const allChildrenChecked =
        childIds.length > 0 && childIds.every((id) => filters.categories.includes(id));
      const isChecked =
        childIds.length > 0 ? allChildrenChecked : filters.categories.includes(cat.id);
      return (
        <div key={cat.id} style={{ marginLeft: level * 14 }}>
          <label className="flex items-start gap-2.5 cursor-pointer py-1.5 text-sm">
            <input
              type="checkbox"
              className="mt-1 rounded shrink-0"
              style={{ accentColor: "var(--primary)" }}
              checked={isChecked}
              onChange={() => handleCategoryTreeChange(cat, isChecked)}
              aria-labelledby={`cat-label-${cat.id}`}
            />
            <span id={`cat-label-${cat.id}`}>{cat.name}</span>
          </label>
          {subChildren && subChildren.length > 0 && renderCategoryTree(cat.id, level + 1)}
        </div>
      );
    });
  }

  function applyPrice() {
    const minParsed = parseFloat(minStr);
    const maxParsed = parseFloat(maxStr);

    const minFinal =
      Number.isFinite(minParsed) && minParsed >= 0 ? minParsed : 0;

    let maxFinal = SHOP_PRICE_MAX_UNLIMITED;
    if (maxStr.trim() !== "") {
      if (!Number.isFinite(maxParsed) || maxParsed <= 0) {
        return;
      }
      maxFinal = maxParsed;
    }

    if (
      maxFinal !== SHOP_PRICE_MAX_UNLIMITED &&
      maxFinal <= minFinal
    ) {
      return;
    }

    setFilters((prev) => ({
      ...prev,
      price: [minFinal, maxFinal],
    }));
  }

  function clearPriceFilter() {
    setMinStr("");
    setMaxStr("");
    setFilters((prev) => ({
      ...prev,
      price: [0, SHOP_PRICE_MAX_UNLIMITED],
    }));
  }

  const priceFiltered =
    filters.price[0] > 0 || filters.price[1] < SHOP_PRICE_MAX_UNLIMITED;

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          className="w-full flex justify-between items-center font-semibold text-sm mb-2 py-1 rounded-lg hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          style={{ color: "var(--foreground)" }}
          onClick={() => setCollapseCategory((v) => !v)}
          aria-expanded={collapseCategory}
        >
          Categories
          <span className="text-xs font-normal opacity-70">{collapseCategory ? "Hide" : "Show"}</span>
        </button>
        {collapseCategory && (
          <div className="flex flex-col gap-0.5 pl-1 rounded-lg py-2">
            {categoriesLoading ? (
              <p className="text-sm animate-pulse" style={{ color: "var(--muted-foreground)" }}>
                Loading categories…
              </p>
            ) : categories.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No categories available.
              </p>
            ) : (
              rootCategories
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cat) => {
                  const children = categoryTree[cat.id];
                  const childIds = children ? children.map((c) => c.id) : [];
                  const allChildrenChecked =
                    childIds.length > 0 &&
                    childIds.every((id) => filters.categories.includes(id));
                  const isChecked =
                    childIds.length > 0
                      ? allChildrenChecked
                      : filters.categories.includes(cat.id);
                  return (
                    <div key={cat.id}>
                      <label className="flex items-start gap-2.5 cursor-pointer py-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 rounded shrink-0"
                          style={{ accentColor: "var(--primary)" }}
                          checked={isChecked}
                          onChange={() => handleCategoryTreeChange(cat, isChecked)}
                        />
                        <span>{cat.name}</span>
                      </label>
                      {children &&
                        children.length > 0 &&
                        renderCategoryTree(cat.id, 1)}
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>

      <div className="h-px" style={{ background: "var(--sidebar-border)" }} role="presentation" />

      <div>
        <button
          type="button"
          className="w-full flex justify-between items-center font-semibold text-sm mb-3 py-1 rounded-lg hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          style={{ color: "var(--foreground)" }}
          onClick={() => setCollapsePrice((v) => !v)}
          aria-expanded={collapsePrice}
        >
          Price (GBP)
          <span className="text-xs font-normal opacity-70">{collapsePrice ? "Hide" : "Show"}</span>
        </button>
        {collapsePrice && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              Uses product price from the catalogue. Leave max empty for no upper limit.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="shop-price-min" className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>
                  Min
                </label>
                <input
                  id="shop-price-min"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  placeholder="0"
                  value={minStr}
                  onChange={(e) => setMinStr(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
              <div>
                <label htmlFor="shop-price-max" className="text-xs font-medium block mb-1" style={{ color: "var(--muted-foreground)" }}>
                  Max
                </label>
                <input
                  id="shop-price-max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  placeholder="Any"
                  value={maxStr}
                  onChange={(e) => setMaxStr(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="primary" onClick={applyPrice}>
                Apply price
              </Button>
              {priceFiltered && (
                <Button type="button" size="sm" variant="outline" onClick={clearPriceFilter}>
                  Clear price
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

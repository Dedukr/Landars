"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { SortOption } from "@/components/SortList";
import { toast } from "sonner";
import ProductRecommendations from "@/components/ProductRecommendations";
import { useWishlistOptimized } from "@/hooks/useWishlistOptimized";
import { useWishlistItems } from "@/hooks/useWishlistItems";
import WishlistHero from "@/components/wishlist/WishlistHero";
import WishlistSummaryStrip from "@/components/wishlist/WishlistSummaryStrip";
import WishlistFilters from "@/components/wishlist/WishlistFilters";
import WishlistGrid from "@/components/wishlist/WishlistGrid";
import WishlistEmptyState from "@/components/wishlist/WishlistEmptyState";
import WishlistErrorState from "@/components/wishlist/WishlistErrorState";
import WishlistLoadingState from "@/components/wishlist/WishlistLoadingState";
import { Button } from "@/components/ui/Button";

export default function WishlistSignedIn() {
  const {
    products,
    loading,
    stats,
    clearWishlist,
    wishlist,
    productsLoadError,
    retryProductsFetch,
  } = useWishlistOptimized();
  const { filteredProducts, removingIds, removeItem } = useWishlistItems(products);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "name_desc" | "price" | "price_desc">(
    "name"
  );
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // ``ProductCategory`` rows are flat leaves now, so every category on a product is
  // already display-worthy — no more filtering out structural parent-category names.
  const productsWithLeafCategories = filteredProducts;

  const wishlistSortOptions: SortOption[] = [
    { value: "name", label: "Name: A–Z", icon: "↑" },
    { value: "name_desc", label: "Name: Z–A", icon: "↓" },
    { value: "price", label: "Price: low to high", icon: "↑" },
    { value: "price_desc", label: "Price: high to low", icon: "↓" },
  ];

  const leafCategoriesForFilter = useMemo(() => {
    const leafCategorySet = new Set<string>();
    productsWithLeafCategories.forEach((product) => {
      product.categories?.forEach((cat) => leafCategorySet.add(cat));
    });
    return Array.from(leafCategorySet).sort();
  }, [productsWithLeafCategories]);

  const categoryFilterOptions: SortOption[] = [
    { value: "all", label: "All categories", icon: "📂" },
    ...leafCategoriesForFilter.map((category) => ({
      value: category,
      label: category,
      icon: "🏷️",
    })),
  ];

  const handleItemAddToBasket = useCallback((productName: string) => {
    toast.success(`${productName} added to your basket`);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value as "name" | "name_desc" | "price" | "price_desc");
  }, []);

  const handleFilterChange = useCallback((category: string) => {
    setFilterCategory(category);
  }, []);

  const filteredAndSortedProducts = useMemo(() => {
    return Array.isArray(productsWithLeafCategories)
      ? productsWithLeafCategories
          .filter((product) => {
            const productName = typeof product.name === "string" ? product.name : "";
            const productDescription =
              typeof product.description === "string" ? product.description : "";
            const searchLower =
              typeof searchQuery === "string" ? searchQuery.toLowerCase() : "";

            const matchesSearch =
              productName.toLowerCase().includes(searchLower) ||
              (productDescription && productDescription.toLowerCase().includes(searchLower));
            const matchesCategory =
              filterCategory === "all" || product.categories?.includes(filterCategory);
            return matchesSearch && matchesCategory;
          })
          .sort((a, b) => {
            const nameA = typeof a.name === "string" ? a.name : "";
            const nameB = typeof b.name === "string" ? b.name : "";
            const priceA = parseFloat(String(a.price));
            const priceB = parseFloat(String(b.price));
            switch (sortBy) {
              case "name":
                return nameA.localeCompare(nameB);
              case "name_desc":
                return nameB.localeCompare(nameA);
              case "price":
                return (Number.isFinite(priceA) ? priceA : 0) - (Number.isFinite(priceB) ? priceB : 0);
              case "price_desc":
                return (Number.isFinite(priceB) ? priceB : 0) - (Number.isFinite(priceA) ? priceA : 0);
              default:
                return 0;
            }
          })
      : [];
  }, [productsWithLeafCategories, searchQuery, filterCategory, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <WishlistHero
            itemCount={0}
            savedTotalCount={wishlist.length}
            isLoading={loading}
            hasError={false}
          />
          <WishlistLoadingState />
        </div>
      </div>
    );
  }

  if (wishlist.length === 0) {
    return (
      <div className="min-h-screen py-6 sm:py-8" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <WishlistHero itemCount={0} isLoading={false} hasError={false} />
          <WishlistEmptyState />
        </div>
      </div>
    );
  }

  if (productsLoadError) {
    return (
      <div className="min-h-screen py-6 sm:py-8" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <WishlistHero
            itemCount={0}
            savedTotalCount={wishlist.length}
            isLoading={false}
            hasError
          />
          <WishlistErrorState onRetry={retryProductsFetch} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 sm:py-8" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <WishlistHero
          itemCount={filteredAndSortedProducts.length}
          savedTotalCount={wishlist.length}
          isLoading={false}
          hasError={false}
        />
        <WishlistSummaryStrip stats={stats} />

        <WishlistFilters
          searchQuery={searchQuery}
          sortBy={sortBy}
          filterCategory={filterCategory}
          categoryFilterOptions={categoryFilterOptions}
          wishlistSortOptions={wishlistSortOptions}
          onSearchChange={handleSearchChange}
          onSortChange={handleSortChange}
          onFilterChange={handleFilterChange}
        />

        <section
          className="mb-8"
          aria-labelledby="wishlist-items-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-5">
            <h2
              id="wishlist-items-heading"
              className="text-lg sm:text-xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              Saved items
              <span className="ml-2 text-base font-semibold tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                ({filteredAndSortedProducts.length})
              </span>
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start sm:self-auto min-h-[44px] text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
              onClick={() => void clearWishlist()}
            >
              Clear wishlist
            </Button>
          </div>

          {filteredAndSortedProducts.length === 0 && productsWithLeafCategories.length > 0 ? (
            <p
              role="status"
              className="rounded-2xl border px-5 py-10 text-center text-sm font-medium"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                color: "var(--muted-foreground)",
              }}
            >
              No items match your search or filters. Clear the search or choose &ldquo;All categories&rdquo; to see
              everything you have saved.
            </p>
          ) : (
            <WishlistGrid
              products={filteredAndSortedProducts}
              removingIds={removingIds}
              onRemove={removeItem}
              onAddedToBasket={handleItemAddToBasket}
            />
          )}
        </section>

        <ProductRecommendations
          excludeProducts={filteredProducts}
          limit={4}
          title="You might also like"
          showWishlist={false}
          showQuickAdd={true}
          gridCols={{ default: 2, md: 4 }}
          className="mt-2"
        />

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
          <Button variant="outline" size="lg" fullWidth className="sm:w-auto sm:min-w-[200px]" asChild>
            <Link href="/shop">Continue shopping</Link>
          </Button>
          <Button variant="ghost" size="lg" fullWidth className="sm:w-auto" asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

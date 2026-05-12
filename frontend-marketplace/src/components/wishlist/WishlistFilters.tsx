"use client";

import { memo, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import SortList, { SortOption } from "@/components/SortList";

interface WishlistFiltersProps {
  searchQuery: string;
  sortBy: string;
  filterCategory: string;
  categoryFilterOptions: SortOption[];
  wishlistSortOptions: SortOption[];
  onSearchChange: (query: string) => void;
  onSortChange: (sortBy: string) => void;
  onFilterChange: (category: string) => void;
}

/** Client-side search, category filter (from existing product categories), and sort — no extra backend params. */
const WishlistFilters = memo(function WishlistFilters({
  searchQuery,
  sortBy,
  filterCategory,
  categoryFilterOptions,
  wishlistSortOptions,
  onSearchChange,
  onSortChange,
  onFilterChange,
}: WishlistFiltersProps) {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  return (
    <div
      className="rounded-2xl border p-4 sm:p-6 mb-5 sm:mb-6"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <Input
        type="search"
        label="Search saved items"
        placeholder="Search your wishlist…"
        value={searchQuery}
        onChange={handleSearchChange}
        fullWidth
        leftIcon={<Search className="w-4 h-4" aria-hidden />}
        autoComplete="off"
        className="rounded-xl"
      />

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <span className="sr-only">Filter by category</span>
          <SortList
            options={categoryFilterOptions}
            value={filterCategory}
            onChange={onFilterChange}
            placeholder="All categories…"
            className="w-full min-h-[44px]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <span className="sr-only">Sort wishlist</span>
          <SortList
            options={wishlistSortOptions}
            value={sortBy}
            onChange={onSortChange}
            placeholder="Sort…"
            className="w-full min-h-[44px]"
          />
        </div>
      </div>
    </div>
  );
});

export default WishlistFilters;

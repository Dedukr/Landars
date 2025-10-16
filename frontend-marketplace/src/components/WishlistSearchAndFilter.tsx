"use client";
import React, { memo, useCallback } from "react";
import SortList, { SortOption } from "./SortList";

interface WishlistSearchAndFilterProps {
  searchQuery: string;
  sortBy: string;
  filterCategory: string;
  categoryFilterOptions: SortOption[];
  wishlistSortOptions: SortOption[];
  onSearchChange: (query: string) => void;
  onSortChange: (sortBy: string) => void;
  onFilterChange: (category: string) => void;
}

const WishlistSearchAndFilter = memo<WishlistSearchAndFilterProps>(
  ({
    searchQuery,
    sortBy,
    filterCategory,
    categoryFilterOptions,
    wishlistSortOptions,
    onSearchChange,
    onSortChange,
    onFilterChange,
  }) => {
    const handleSearchChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchChange(e.target.value);
      },
      [onSearchChange]
    );

    const handleSortChange = useCallback(
      (value: string) => {
        onSortChange(value);
      },
      [onSortChange]
    );

    const handleFilterChange = useCallback(
      (value: string) => {
        onFilterChange(value);
      },
      [onFilterChange]
    );

    return (
      <div
        className="rounded-lg shadow-sm p-6 mb-6"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search your wishlist..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full px-4 py-2.5 rounded-full focus:outline-none"
              style={{
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--sidebar-border)",
              }}
            />
          </div>
          <div className="flex gap-2">
            <SortList
              options={categoryFilterOptions}
              value={filterCategory}
              onChange={handleFilterChange}
              placeholder="Filter by category..."
              className="min-w-[180px]"
            />
            <SortList
              options={wishlistSortOptions}
              value={sortBy}
              onChange={handleSortChange}
              placeholder="Choose sorting..."
              className="min-w-[200px]"
            />
          </div>
        </div>
      </div>
    );
  }
);

WishlistSearchAndFilter.displayName = "WishlistSearchAndFilter";

export default WishlistSearchAndFilter;

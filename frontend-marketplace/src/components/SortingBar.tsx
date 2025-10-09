"use client";
import React, { useState } from "react";
import SortList, { SortOption } from "./SortList";

const sortOptions: SortOption[] = [
  { value: "name_asc", label: "Name: A-Z", icon: "↑" },
  { value: "name_desc", label: "Name: Z-A", icon: "↓" },
  { value: "price_desc", label: "Price: High to Low", icon: "↓" },
  { value: "price_asc", label: "Price: Low to High", icon: "↑" },
];

// Date sorting has been removed as requested

interface Product {
  id: number;
  name: string;
}

interface SortingBarProps {
  sort: string;
  setSort: (sort: string) => void;
  search: string;
  setSearch: (search: string) => void;
}

const SortingBar: React.FC<SortingBarProps> = ({
  sort,
  setSort,
  search,
  setSearch,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  async function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);
    if (value.length > 1) {
      const res = await fetch(
        `/api/products/?search=${encodeURIComponent(value)}`
      );
      if (res.ok) {
        const data: Product[] = await res.json();
        setSuggestions(data.map((p) => p.name));
        setShowSuggestions(true);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleSuggestionClick(s: string) {
    setSearch(s);
    setShowSuggestions(false);
    // Optionally: trigger navigation or filtering
    if (typeof window !== "undefined") {
      const event = new CustomEvent("product-search", { detail: s });
      window.dispatchEvent(event);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6 mb-1024-down">
      {/* Search Bar */}
      <div className="relative flex-1 max-w-md">
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search products by name..."
          className="w-full rounded-full px-4 py-2.5 transition-all duration-300"
          style={{
            border: "1px solid var(--sidebar-border)",
            background: "var(--card-bg)",
            color: "var(--foreground)",
          }}
          onFocus={() => setShowSuggestions(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul
            className="absolute z-10 rounded w-full mt-1 shadow"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
          >
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="px-3 py-2 cursor-pointer"
                style={{ color: "var(--foreground)" }}
                onMouseDown={() => handleSuggestionClick(s)}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sort Dropdown */}
      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="font-medium text-sm" id="sort-label">
          Sort by:
        </label>
        <div className="min-w-[200px]">
          <SortList
            options={sortOptions}
            value={sort}
            onChange={setSort}
            placeholder="Choose sorting..."
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default SortingBar;

import React from "react";

const sortOptions = [
  { value: "name_asc", label: "Name: A-Z" },
  { value: "name_desc", label: "Name: Z-A" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

interface SortingBarProps {
  sort: string;
  setSort: (sort: string) => void;
  view: "grid" | "list";
  setView: (view: "grid" | "list") => void;
}

const SortingBar: React.FC<SortingBarProps> = ({
  sort,
  setSort,
  view,
  setView,
}) => (
  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="font-medium text-sm">
        Sort by:
      </label>
      <select
        id="sort"
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
    <div className="flex items-center gap-2">
      <button
        className={`p-2 rounded ${
          view === "grid" ? "bg-blue-600 text-white" : "bg-gray-100"
        }`}
        onClick={() => setView("grid")}
        aria-label="Grid view"
      >
        <svg
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>
      <button
        className={`p-2 rounded ${
          view === "list" ? "bg-blue-600 text-white" : "bg-gray-100"
        }`}
        onClick={() => setView("list")}
        aria-label="List view"
      >
        <svg
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <rect x="3" y="4" width="18" height="4" />
          <rect x="3" y="10" width="18" height="4" />
          <rect x="3" y="16" width="18" height="4" />
        </svg>
      </button>
    </div>
  </div>
);

export default SortingBar;

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
}

const SortingBar: React.FC<SortingBarProps> = ({
  sort,
  setSort,
}) => (
  <div className="flex items-center gap-2 mb-6">
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
);

export default SortingBar;

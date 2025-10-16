"use client";
import React from "react";

interface OrderFiltersProps {
  filters: {
    status: string;
    dateFrom: string;
    dateTo: string;
    sort: string;
  };
  onFilterChange: (filters: Partial<OrderFiltersProps["filters"]>) => void;
}

export default function OrderFilters({
  filters,
  onFilterChange,
}: OrderFiltersProps) {
  const statusOptions = [
    { value: "", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "paid", label: "Paid" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const sortOptions = [
    { value: "-order_date", label: "Newest First" },
    { value: "order_date", label: "Oldest First" },
    { value: "-delivery_date", label: "Delivery Date (Latest)" },
    { value: "delivery_date", label: "Delivery Date (Earliest)" },
    { value: "-total_price", label: "Highest Amount" },
    { value: "total_price", label: "Lowest Amount" },
  ];

  const clearFilters = () => {
    onFilterChange({
      status: "",
      dateFrom: "",
      dateTo: "",
      sort: "-order_date",
    });
  };

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== "" && value !== "-order_date"
  );

  return (
    <div
      className="rounded-lg shadow-sm"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Filter & Sort Orders
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status Filter */}
          <div>
            <label
              htmlFor="status-filter"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--foreground)" }}
            >
              Status
            </label>
            <select
              id="status-filter"
              value={filters.status}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date From Filter */}
          <div>
            <label
              htmlFor="date-from-filter"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--foreground)" }}
            >
              From Date
            </label>
            <input
              type="date"
              id="date-from-filter"
              value={filters.dateFrom}
              onChange={(e) => onFilterChange({ dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            />
          </div>

          {/* Date To Filter */}
          <div>
            <label
              htmlFor="date-to-filter"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--foreground)" }}
            >
              To Date
            </label>
            <input
              type="date"
              id="date-to-filter"
              value={filters.dateTo}
              onChange={(e) => onFilterChange({ dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            />
          </div>

          {/* Sort Filter */}
          <div>
            <label
              htmlFor="sort-filter"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--foreground)" }}
            >
              Sort By
            </label>
            <select
              id="sort-filter"
              value={filters.sort}
              onChange={(e) => onFilterChange({ sort: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div
            className="mt-4 pt-4"
            style={{ borderTop: "1px solid var(--sidebar-border)" }}
          >
            <div className="flex flex-wrap gap-2">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Active filters:
              </span>
              {filters.status && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  Status:{" "}
                  {
                    statusOptions.find((opt) => opt.value === filters.status)
                      ?.label
                  }
                  <button
                    onClick={() => onFilterChange({ status: "" })}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              )}
              {filters.dateFrom && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  From: {new Date(filters.dateFrom).toLocaleDateString()}
                  <button
                    onClick={() => onFilterChange({ dateFrom: "" })}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              )}
              {filters.dateTo && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  To: {new Date(filters.dateTo).toLocaleDateString()}
                  <button
                    onClick={() => onFilterChange({ dateTo: "" })}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              )}
              {filters.sort !== "-order_date" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  Sort:{" "}
                  {sortOptions.find((opt) => opt.value === filters.sort)?.label}
                  <button
                    onClick={() => onFilterChange({ sort: "-order_date" })}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

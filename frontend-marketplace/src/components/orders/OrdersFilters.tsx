"use client";

import { memo, useCallback } from "react";
import { CalendarRange, RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import SortList, { type SortOption } from "@/components/SortList";
import {
  ORDER_SORT_OPTIONS,
  ORDER_STATUS_CHIP_OPTIONS,
  type OrdersStatusFilter,
} from "@/lib/orderTypes";
import { cn } from "@/lib/utils";

export type OrdersChipFilter = OrdersStatusFilter | "active";

interface OrdersFiltersProps {
  searchQuery: string;
  statusChip: OrdersChipFilter;
  sort: string;
  dateFrom: string;
  dateTo: string;
  resultCount: number;
  totalCount: number;
  onSearchChange: (query: string) => void;
  onStatusChipChange: (chip: OrdersChipFilter) => void;
  onSortChange: (sort: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onReset: () => void;
}

const sortOptions: SortOption[] = ORDER_SORT_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  icon: o.value.startsWith("-") ? "↓" : "↑",
}));

const OrdersFilters = memo(function OrdersFilters({
  searchQuery,
  statusChip,
  sort,
  dateFrom,
  dateTo,
  resultCount,
  totalCount,
  onSearchChange,
  onStatusChipChange,
  onSortChange,
  onDateFromChange,
  onDateToChange,
  onReset,
}: OrdersFiltersProps) {
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusChip !== "" ||
    sort !== "-created_at" ||
    dateFrom !== "" ||
    dateTo !== "";

  return (
    <section aria-label="Filter orders" className="mb-4 sm:mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Input
            type="search"
            placeholder="Search by order number…"
            value={searchQuery}
            onChange={handleSearch}
            fullWidth
            leftIcon={<Search className="h-4 w-4" aria-hidden />}
            autoComplete="off"
            className="rounded-xl"
            inputMode="numeric"
            aria-label="Search by order number"
          />
        </div>
        <div className="sm:w-[14rem] sm:shrink-0">
          <SortList
            options={sortOptions}
            value={sort}
            onChange={onSortChange}
            placeholder="Sort orders…"
            className="w-full min-h-[44px]"
          />
        </div>
      </div>

      <div
        className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-smooth"
        role="tablist"
        aria-label="Filter by order status"
      >
        {ORDER_STATUS_CHIP_OPTIONS.map((chip) => {
          const selected = statusChip === chip.value;
          return (
            <button
              key={chip.value || "all"}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onStatusChipChange(chip.value as OrdersChipFilter)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors sm:text-sm",
                "min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              )}
              style={{
                background: selected ? "var(--btn-primary)" : "var(--card-bg)",
                color: selected ? "var(--btn-primary-fg)" : "var(--foreground)",
                borderColor: selected ? "var(--btn-primary)" : "var(--sidebar-border)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <details className="group mt-3">
        <summary
          className="inline-flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 rounded-md px-1 text-xs font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:text-sm"
          style={{ color: "var(--primary)" }}
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="group-open:hidden">Date range</span>
          <span className="hidden group-open:inline">Hide date range</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="orders-date-from"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--foreground)" }}
            >
              From
            </label>
            <input
              id="orders-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="orders-date-to"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--foreground)" }}
            >
              To
            </label>
            <input
              id="orders-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              style={{
                background: "var(--card-bg)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            />
          </div>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {totalCount > 0 ? (
          <p
            className="text-xs font-semibold tabular-nums sm:text-sm"
            style={{ color: "var(--muted-foreground)" }}
            role="status"
          >
            {resultCount === totalCount && !hasActiveFilters
              ? `${totalCount} order${totalCount === 1 ? "" : "s"}`
              : `Showing ${resultCount} of ${totalCount} order${totalCount === 1 ? "" : "s"}`}
          </p>
        ) : (
          <span aria-hidden />
        )}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:text-sm"
            style={{ color: "var(--primary)" }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset filters
          </button>
        ) : null}
      </div>
    </section>
  );
});

export default OrdersFilters;

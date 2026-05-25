"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import OrdersPageHeader from "@/components/orders/OrdersPageHeader";
import OrdersFilters, { type OrdersChipFilter } from "@/components/orders/OrdersFilters";
import OrdersList from "@/components/orders/OrdersList";
import OrdersEmptyState from "@/components/orders/OrdersEmptyState";
import OrdersErrorState from "@/components/orders/OrdersErrorState";
import OrdersLoadingState from "@/components/orders/OrderCardSkeleton";
import {
  ACTIVE_ORDER_STATUSES,
  type OrdersStatusFilter,
  type UseOrdersFilters,
} from "@/lib/orderTypes";
import { useOrders } from "@/hooks/useOrders";

const DEFAULT_FILTERS: UseOrdersFilters = {
  status: "",
  dateFrom: "",
  dateTo: "",
  sort: "-created_at",
};

export default function OrdersSignedIn() {
  const [apiFilters, setApiFilters] = useState<UseOrdersFilters>(DEFAULT_FILTERS);
  const [statusChip, setStatusChip] = useState<OrdersChipFilter>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reorderingId, setReorderingId] = useState<number | null>(null);

  const {
    orders,
    loading,
    loadingMore,
    error,
    totalCount,
    hasMore,
    fetchOrders,
    reorderItems,
  } = useOrders(apiFilters);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusChipChange = useCallback((chip: OrdersChipFilter) => {
    setStatusChip(chip);
    if (chip === "active") {
      setApiFilters((prev) => ({ ...prev, status: "" }));
      return;
    }
    setApiFilters((prev) => ({
      ...prev,
      status: chip as OrdersStatusFilter,
    }));
  }, []);

  const handleApiFilterPatch = useCallback((patch: Partial<UseOrdersFilters>) => {
    setApiFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleReset = useCallback(() => {
    setSearchQuery("");
    setStatusChip("");
    setApiFilters(DEFAULT_FILTERS);
  }, []);

  const displayedOrders = useMemo(() => {
    let list = orders;

    if (statusChip === "active") {
      list = list.filter((o) =>
        ACTIVE_ORDER_STATUSES.includes(
          o.status as (typeof ACTIVE_ORDER_STATUSES)[number]
        )
      );
    }

    const q = searchQuery.trim();
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter((o) => {
        const idStr = String(o.id);
        return (
          idStr.includes(lower) ||
          lower.replace(/^#/, "") === idStr
        );
      });
    }

    return list;
  }, [orders, statusChip, searchQuery]);

  const hasClientFilters =
    searchQuery.trim() !== "" || statusChip === "active";

  const hasActiveFilters =
    hasClientFilters ||
    apiFilters.status !== "" ||
    apiFilters.sort !== "-created_at" ||
    apiFilters.dateFrom !== "" ||
    apiFilters.dateTo !== "";

  const handleReorder = useCallback(
    async (orderId: number) => {
      setReorderingId(orderId);
      try {
        await reorderItems(orderId);
        toast.success("Items added to your basket");
      } catch {
        toast.error("Could not add items to your basket. Try again from order details.");
      } finally {
        setReorderingId(null);
      }
    },
    [reorderItems]
  );

  const showInitialLoading = loading && orders.length === 0;
  const showEmpty =
    !loading && !error && displayedOrders.length === 0;
  const showList = !error && displayedOrders.length > 0;

  return (
    <div className="min-h-screen pb-12" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-6 sm:px-6 lg:max-w-4xl lg:px-8 lg:pt-8">
        <OrdersPageHeader totalCount={totalCount} isLoading={showInitialLoading} />

        {!showInitialLoading && !error ? (
          <OrdersFilters
            searchQuery={searchQuery}
            statusChip={statusChip}
            sort={apiFilters.sort}
            dateFrom={apiFilters.dateFrom}
            dateTo={apiFilters.dateTo}
            resultCount={displayedOrders.length}
            totalCount={totalCount}
            onSearchChange={setSearchQuery}
            onStatusChipChange={handleStatusChipChange}
            onSortChange={(sort) => handleApiFilterPatch({ sort })}
            onDateFromChange={(dateFrom) => handleApiFilterPatch({ dateFrom })}
            onDateToChange={(dateTo) => handleApiFilterPatch({ dateTo })}
            onReset={handleReset}
          />
        ) : null}

        {showInitialLoading ? <OrdersLoadingState /> : null}

        {error && !showInitialLoading ? (
          <OrdersErrorState onRetry={() => fetchOrders()} />
        ) : null}

        {showEmpty ? (
          <OrdersEmptyState
            hasActiveFilters={hasActiveFilters}
            onClearFilters={hasActiveFilters ? handleReset : undefined}
          />
        ) : null}

        {showList ? (
          <>
            <OrdersList
              orders={displayedOrders}
              reorderingId={reorderingId}
              onReorder={handleReorder}
            />

            {hasMore && statusChip !== "active" && !searchQuery.trim() ? (
              <div className="mt-8 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-[48px] w-full max-w-sm"
                  onClick={() => fetchOrders(true)}
                  loading={loadingMore}
                >
                  Load more orders
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

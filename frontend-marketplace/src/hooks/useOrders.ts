"use client";

import { useState, useCallback } from "react";
import { httpClient } from "@/utils/httpClient";
import type {
  OrderListEntry,
  OrdersListResponse,
  UseOrdersFilters,
} from "@/lib/orderTypes";

const PAGE_SIZE = 20;

interface UseOrdersReturn {
  orders: OrderListEntry[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  totalCount: number;
  hasMore: boolean;
  fetchOrders: (loadMore?: boolean) => Promise<void>;
  cancelOrder: (orderId: number) => Promise<void>;
  reorderItems: (orderId: number) => Promise<void>;
}

export function useOrders(filters: UseOrdersFilters): UseOrdersReturn {
  const [orders, setOrders] = useState<OrderListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchOrders = useCallback(
    async (loadMore = false) => {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const queryParams = new URLSearchParams();

        if (filters.status) queryParams.append("status", filters.status);
        if (filters.dateFrom) queryParams.append("date_from", filters.dateFrom);
        if (filters.dateTo) queryParams.append("date_to", filters.dateTo);
        if (filters.sort) queryParams.append("sort", filters.sort);

        const currentOffset = loadMore ? offset : 0;
        queryParams.append("limit", String(PAGE_SIZE));
        queryParams.append("offset", String(currentOffset));

        const response = await httpClient.get<OrdersListResponse>(
          `/api/orders/?${queryParams.toString()}`
        );

        const ordersData = response.results ?? [];
        const count = response.count ?? ordersData.length;

        if (loadMore) {
          setOrders((prev) => [...prev, ...ordersData]);
        } else {
          setOrders(ordersData);
        }

        const nextOffset = currentOffset + ordersData.length;
        setOffset(nextOffset);
        setTotalCount(count);
        setHasMore(nextOffset < count);
      } catch (err: unknown) {
        console.error("Error fetching orders:", err);
        setError("We could not load your orders. Please try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, offset]
  );

  const cancelOrder = useCallback(async (orderId: number) => {
    try {
      await httpClient.patch(`/api/orders/${orderId}/`, {
        status: "cancelled",
      });

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? { ...order, status: "cancelled" as const }
            : order
        )
      );
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      throw new Error(error.response?.data?.error || "Failed to cancel order");
    }
  }, []);

  const reorderItems = useCallback(async (orderId: number) => {
    try {
      const order = await httpClient.get<OrderListEntry>(
        `/api/orders/${orderId}/`
      );

      for (const item of order.items ?? []) {
        await httpClient.post("/api/cart/", {
          product_id: item.product,
          quantity: parseFloat(item.quantity),
        });
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      throw new Error(error.response?.data?.error || "Failed to reorder items");
    }
  }, []);

  return {
    orders,
    loading,
    loadingMore,
    error,
    totalCount,
    hasMore,
    fetchOrders,
    cancelOrder,
    reorderItems,
  };
}

export type { OrderListEntry };

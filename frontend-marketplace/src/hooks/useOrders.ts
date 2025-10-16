"use client";
import { useState, useCallback } from "react";
import { httpClient } from "@/utils/httpClient";

interface OrderItem {
  id: number;
  product: number;
  product_name: string;
  product_price: string;
  product_image_url?: string;
  quantity: string;
  total_price: string;
}

interface Order {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  notes?: string;
  delivery_date: string;
  is_home_delivery: boolean;
  delivery_fee: string;
  discount: string;
  order_date: string;
  status: "pending" | "paid" | "cancelled";
  invoice_link?: string;
  items: OrderItem[];
  total_price: string;
  total_items: number;
}

interface OrderStats {
  total_orders: number;
  pending_orders: number;
  paid_orders: number;
  cancelled_orders: number;
  total_spent: number;
  average_order_value: number;
}

interface UseOrdersFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
}

interface UseOrdersReturn {
  orders: Order[];
  loading: boolean;
  error: string | null;
  stats: OrderStats | null;
  fetchOrders: (loadMore?: boolean) => Promise<void>;
  cancelOrder: (orderId: number) => Promise<void>;
  reorderItems: (orderId: number) => Promise<void>;
}

export function useOrders(filters: UseOrdersFilters): UseOrdersReturn {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [offset, setOffset] = useState(0);

  const fetchOrders = useCallback(
    async (loadMore = false) => {
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();

        if (filters.status) queryParams.append("status", filters.status);
        if (filters.dateFrom) queryParams.append("date_from", filters.dateFrom);
        if (filters.dateTo) queryParams.append("date_to", filters.dateTo);
        if (filters.sort) queryParams.append("sort", filters.sort);

        queryParams.append("limit", "20");
        queryParams.append("offset", loadMore ? offset.toString() : "0");

        const response = (await httpClient.get(
          `/api/orders/?${queryParams.toString()}`
        )) as { results: Order[]; count: number };

        const ordersData = response.results || [];

        if (loadMore) {
          setOrders((prev) => [...prev, ...ordersData]);
        } else {
          setOrders(ordersData);
          setOffset(0);
        }

        setOffset((prev) => prev + 20);
        const totalOrders = ordersData.length;
        const pendingOrders = ordersData.filter(
          (order: Order) => order.status === "pending"
        ).length;
        const paidOrders = ordersData.filter(
          (order: Order) => order.status === "paid"
        ).length;
        const cancelledOrders = ordersData.filter(
          (order: Order) => order.status === "cancelled"
        ).length;
        const totalSpent = ordersData
          .filter((order: Order) => order.status === "paid")
          .reduce(
            (sum: number, order: Order) => sum + parseFloat(order.total_price),
            0
          );
        const averageOrderValue = paidOrders > 0 ? totalSpent / paidOrders : 0;

        setStats({
          total_orders: totalOrders,
          pending_orders: pendingOrders,
          paid_orders: paidOrders,
          cancelled_orders: cancelledOrders,
          total_spent: totalSpent,
          average_order_value: averageOrderValue,
        });
      } catch (err: unknown) {
        console.error("Error fetching orders:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch orders";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [filters, offset]
  );

  const cancelOrder = useCallback(async (orderId: number) => {
    try {
      await httpClient.patch(`/api/orders/${orderId}/`, {
        status: "cancelled",
      });

      // Update the order in the local state
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
      // Get the order details
      const orderResponse = (await httpClient.get(
        `/api/orders/${orderId}/`
      )) as { data: Order };
      const order = orderResponse.data;

      // Add each item from the order to the cart
      for (const item of order.items) {
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
    error,
    stats,
    fetchOrders,
    cancelOrder,
    reorderItems,
  };
}

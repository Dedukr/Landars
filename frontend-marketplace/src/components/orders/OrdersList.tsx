"use client";

import type { OrderListEntry } from "@/lib/orderTypes";
import OrderHistoryCard from "./OrderHistoryCard";

interface OrdersListProps {
  orders: OrderListEntry[];
  reorderingId: number | null;
  onReorder: (orderId: number) => void;
}

export default function OrdersList({
  orders,
  reorderingId,
  onReorder,
}: OrdersListProps) {
  return (
    <ul className="space-y-4 sm:space-y-5" aria-label="Your orders">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderHistoryCard
            order={order}
            onReorder={() => onReorder(order.id)}
            reordering={reorderingId === order.id}
          />
        </li>
      ))}
    </ul>
  );
}

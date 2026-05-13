"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";
import { httpClient } from "@/utils/httpClient";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { OrderDetailsHeader } from "@/components/order/details/OrderDetailsHeader";
import { OrderPaidHighlightCard } from "@/components/order/details/OrderPaidHighlightCard";
import { OrderItemsSection } from "@/components/order/details/OrderItemsSection";
import { DeliveryFulfillmentCard } from "@/components/order/details/DeliveryFulfillmentCard";
import { ShippingTrackingCard } from "@/components/order/details/ShippingTrackingCard";
import { CustomerDetailsCard } from "@/components/order/details/CustomerDetailsCard";
import { OrderSummaryCard } from "@/components/order/details/OrderSummaryCard";
import { OrderSupportCard } from "@/components/order/details/OrderSupportCard";
import { MobileOrderDetailsBar } from "@/components/order/details/MobileOrderDetailsBar";
import { OrderDetailsSkeleton } from "@/components/order/details/OrderDetailsSkeleton";
import { OrderDetailsErrorState } from "@/components/order/details/OrderDetailsErrorState";
import { OrderDetailsNotFoundState } from "@/components/order/details/OrderDetailsNotFoundState";

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuth();
  const [order, setOrder] = useState<MarketplaceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user && !token) {
      router.push(getAuthUrl({ next: pathname }));
    }
  }, [user, token, router, pathname]);

  const fetchOrder = useCallback(async () => {
    if (!params.id) {
      setLoading(false);
      setOrder(null);
      setError("This order link is not valid.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await httpClient.get<MarketplaceOrderDetail>(
        `/api/orders/${params.id}/`
      );
        setOrder(data);
    } catch {
      setOrder(null);
      setError(
        "We couldn’t load this order. It may have been removed, or you may not have access."
      );
      } finally {
        setLoading(false);
      }
  }, [params.id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  if (loading) {
    return <OrderDetailsSkeleton />;
  }

  if (error && !order) {
    return <OrderDetailsErrorState message={error} onRetry={fetchOrder} />;
  }

  if (!order) {
    return <OrderDetailsNotFoundState />;
  }

  const items = order.items ?? [];

  return (
    <div
      className="min-h-screen pb-28 lg:pb-10"
      style={{ background: "var(--background)" }}
    >
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <OrderDetailsHeader order={order} />

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="space-y-6 lg:col-span-7 xl:col-span-8">
            <OrderPaidHighlightCard order={order} />
            <OrderItemsSection items={items} totalItems={order.total_items} />
            <DeliveryFulfillmentCard order={order} />
            <ShippingTrackingCard order={order} />
          </div>

          <aside className="space-y-6 lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-6 lg:space-y-6">
              <OrderSummaryCard
                order={order}
                onViewAllOrders={() => router.push("/orders")}
              />
              <CustomerDetailsCard order={order} />
              <OrderSupportCard />
            </div>
          </aside>
        </div>
      </div>

      <MobileOrderDetailsBar />
    </div>
  );
}

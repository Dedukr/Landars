"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { httpClient } from "@/utils/httpClient";
import { Button } from "@/components/ui/Button";
import LoadingSpinner from "@/components/LoadingSpinner";

interface OrderItem {
  id: number;
  product: {
    id: number;
    name: string;
    price: string;
  };
  quantity: number;
  get_total_price: string;
}

interface Order {
  id: number;
  customer: {
    id: number;
    name: string;
    email: string;
  };
  notes: string;
  delivery_date: string;
  is_home_delivery: boolean;
  delivery_fee: string;
  discount: string;
  order_date: string;
  status: string;
  invoice_link: string;
  customer_address: string;
  items: OrderItem[];
  sum_price: string;
  total_price: string;
  total_items: number;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && !token) {
      router.push("/auth");
    }
  }, [user, token, router]);

  // Fetch order details
  useEffect(() => {
    const fetchOrder = async () => {
      if (!params.id) return;

      try {
        setLoading(true);
        const data = await httpClient.get<Order>(`/api/orders/${params.id}/`);
        setOrder(data);
      } catch (err) {
        console.error("Failed to fetch order:", err);
        setError("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [params.id]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <div className="text-center">
          <div className="mb-6 text-6xl">❌</div>
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: "var(--foreground)" }}
          >
            {error || "Order not found"}
          </h2>
          <p
            className="mb-8 max-w-md mx-auto"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            {error ||
              "The order you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it."}
          </p>
          <Button onClick={() => router.push("/orders")}>
            View All Orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-3xl font-bold"
                style={{ color: "var(--foreground)" }}
              >
                Order Confirmation
              </h1>
              <p
                className="mt-2"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Order #{order.id} •{" "}
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </p>
            </div>
            <div className="text-right">
              <p
                className="text-sm"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Order Date
              </p>
              <p className="font-medium" style={{ color: "var(--foreground)" }}>
                {new Date(order.order_date).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        <div
          className="mb-8 p-6 rounded-lg"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
          }}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="w-8 h-8"
                fill="currentColor"
                viewBox="0 0 20 20"
                style={{ color: "var(--success)" }}
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3
                className="text-lg font-medium"
                style={{ color: "var(--success-text)" }}
              >
                Order Placed Successfully!
              </h3>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--success-text)", opacity: 0.8 }}
              >
                Thank you for your order. We&apos;ll send you a confirmation
                email shortly.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Items */}
            <div
              className="rounded-lg shadow-sm p-6"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Order Items ({order.total_items} items)
              </h2>

              <div className="space-y-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 rounded-lg"
                    style={{ background: "var(--sidebar-bg)" }}
                  >
                    <div className="flex-1">
                      <h3
                        className="font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        {item.product.name}
                      </h3>
                      <p
                        className="text-sm"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Quantity: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className="font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        £{item.get_total_price}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        £{item.product.price} each
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Information */}
            <div
              className="rounded-lg shadow-sm p-6"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Delivery Information
              </h2>

              <div className="space-y-4">
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Delivery Address
                  </p>
                  <p className="mt-1" style={{ color: "var(--foreground)" }}>
                    {order.customer_address}
                  </p>
                </div>

                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Delivery Date
                  </p>
                  <p className="mt-1" style={{ color: "var(--foreground)" }}>
                    {new Date(order.delivery_date).toLocaleDateString()}
                  </p>
                </div>

                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Delivery Type
                  </p>
                  <p className="mt-1" style={{ color: "var(--foreground)" }}>
                    {order.is_home_delivery ? "Home Delivery" : "Collection"}
                  </p>
                </div>

                {order.notes && (
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Special Instructions
                    </p>
                    <p className="mt-1" style={{ color: "var(--foreground)" }}>
                      {order.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div
              className="rounded-lg shadow-sm p-6 sticky top-8"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2
                className="text-lg font-medium mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Order Summary
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                    Subtotal
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    £{parseFloat(order.sum_price).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                    Delivery Fee
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {parseFloat(order.delivery_fee) === 0
                      ? "Free"
                      : `£${parseFloat(order.delivery_fee).toFixed(2)}`}
                  </span>
                </div>

                {parseFloat(order.discount) > 0 && (
                  <div
                    className="flex justify-between text-sm"
                    style={{ color: "var(--success)" }}
                  >
                    <span>Discount</span>
                    <span>-£{parseFloat(order.discount).toFixed(2)}</span>
                  </div>
                )}

                <div
                  className="pt-4"
                  style={{ borderTop: "1px solid var(--sidebar-border)" }}
                >
                  <div className="flex justify-between text-lg font-semibold">
                    <span style={{ color: "var(--foreground)" }}>Total</span>
                    <span style={{ color: "var(--foreground)" }}>
                      £{parseFloat(order.total_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                <Button onClick={() => router.push("/")} fullWidth>
                  Continue Shopping
                </Button>

                <Button
                  onClick={() => router.push("/orders")}
                  variant="outline"
                  fullWidth
                >
                  View All Orders
                </Button>

                {order.invoice_link && (
                  <Button
                    onClick={() => window.open(order.invoice_link, "_blank")}
                    variant="ghost"
                    fullWidth
                  >
                    Download Invoice
                  </Button>
                )}
              </div>

              {/* Order Status */}
              <div
                className="mt-6 p-4 rounded-lg"
                style={{ background: "var(--info-bg)" }}
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-lg mr-2">
                      {order.status === "pending"
                        ? "⏳"
                        : order.status === "paid"
                        ? "✅"
                        : order.status === "cancelled"
                        ? "❌"
                        : "📦"}
                    </span>
                  </div>
                  <div>
                    <h4
                      className="text-sm font-medium"
                      style={{ color: "var(--info-text)" }}
                    >
                      Order Status:{" "}
                      {order.status.charAt(0).toUpperCase() +
                        order.status.slice(1)}
                    </h4>
                    <p
                      className="text-sm"
                      style={{ color: "var(--info-text)", opacity: 0.8 }}
                    >
                      {order.status === "pending" &&
                        "Your order is being processed"}
                      {order.status === "paid" &&
                        "Payment confirmed, preparing for delivery"}
                      {order.status === "cancelled" &&
                        "This order has been cancelled"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

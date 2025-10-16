"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
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
  status: "pending" | "paid" | "cancelled" | "preparing" | "delivered";
  invoice_link?: string;
  items: OrderItem[];
  total_price: string;
  total_items: number;
}

interface OrderDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

const statusConfig = {
  pending: {
    label: "Pending",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    icon: "⏳",
    description: "Your order is being processed",
  },
  paid: {
    label: "Paid",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: "✅",
    description: "Payment confirmed, preparing for delivery",
  },
  preparing: {
    label: "Preparing",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "👨‍🍳",
    description: "Your order is being prepared",
  },
  delivered: {
    label: "Delivered",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    icon: "🚚",
    description: "Your order has been delivered",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "❌",
    description: "This order has been cancelled",
  },
};

// Order Timeline Component
const OrderTimeline = ({ order }: { order: Order }) => {
  const timelineSteps = [
    {
      id: "ordered",
      title: "Order Placed",
      description: "Your order has been received",
      date: order.order_date,
      completed: true,
      icon: "📝",
    },
    {
      id: "paid",
      title: "Payment Confirmed",
      description: "Payment has been processed",
      date:
        order.status === "paid" ||
        order.status === "cancelled" ||
        order.status === "preparing" ||
        order.status === "delivered"
          ? order.order_date
          : null,
      completed:
        order.status === "paid" ||
        order.status === "cancelled" ||
        order.status === "preparing" ||
        order.status === "delivered",
      icon: "💳",
    },
    {
      id: "preparing",
      title: "Preparing Order",
      description: "Your items are being prepared",
      date:
        order.status === "preparing" || order.status === "delivered"
          ? order.order_date
          : null,
      completed: order.status === "preparing" || order.status === "delivered",
      icon: "👨‍🍳",
    },
    {
      id: "delivery",
      title: "Out for Delivery",
      description: "Your order is on its way",
      date: order.delivery_date,
      completed: order.status === "delivered",
      icon: "🚚",
    },
  ];

  return (
    <div className="mb-8">
      <h2
        className="text-xl font-semibold mb-6"
        style={{ color: "var(--foreground)" }}
      >
        Order Progress
      </h2>
      <div className="relative">
        {timelineSteps.map((step, index) => (
          <div
            key={step.id}
            className="relative flex items-start pb-8 last:pb-0"
          >
            {/* Timeline line */}
            {index < timelineSteps.length - 1 && (
              <div
                className={`absolute left-6 top-12 w-0.5 h-16 ${
                  step.completed ? "bg-green-400" : "bg-gray-300"
                }`}
              />
            )}

            {/* Timeline dot */}
            <div
              className={`relative flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                step.completed
                  ? "bg-green-500 border-green-500 text-white"
                  : "bg-white border-gray-300 text-gray-400"
              }`}
            >
              <span className="text-lg">{step.icon}</span>
            </div>

            {/* Timeline content */}
            <div className="ml-6 flex-1">
              <div className="flex items-center justify-between">
                <h3
                  className={`text-lg font-medium ${
                    step.completed ? "text-green-600" : "text-gray-500"
                  }`}
                >
                  {step.title}
                </h3>
                {step.date && (
                  <span className="text-sm text-gray-500">
                    {new Date(step.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Enhanced Product Card Component
const ProductCard = ({ item }: { item: OrderItem }) => {
  return (
    <div
      className="flex items-center space-x-4 p-4 rounded-xl border transition-all duration-200 hover:shadow-md"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div className="flex-shrink-0 relative">
        {item.product_image_url ? (
          <Image
            src={item.product_image_url}
            alt={item.product_name}
            width={80}
            height={80}
            className="w-20 h-20 object-cover rounded-lg shadow-sm"
          />
        ) : (
          <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-3xl">🍎</span>
          </div>
        )}
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
          {item.quantity}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className="text-lg font-semibold truncate mb-1"
          style={{ color: "var(--foreground)" }}
        >
          {item.product_name}
        </h3>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>Unit: £{parseFloat(item.product_price).toFixed(2)}</span>
          <span>•</span>
          <span>Qty: {item.quantity}</span>
        </div>
      </div>

      <div className="text-right">
        <p className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
          £{parseFloat(item.total_price).toFixed(2)}
        </p>
      </div>
    </div>
  );
};

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;

    try {
      setLoading(true);
      const response = (await httpClient.get(
        `/api/orders/${orderId}/`
      )) as Order;
      setOrder(response);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || "Failed to fetch order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setOrderId(resolvedParams.id);
    };
    getParams();
  }, [params]);

  useEffect(() => {
    if (user && orderId) {
      fetchOrder();
    }
  }, [user, orderId, fetchOrder]);

  const handleCancelOrder = async () => {
    if (!order) return;

    try {
      setCancelling(true);
      await httpClient.patch(`/api/orders/${order.id}/`, {
        status: "cancelled",
      });
      setOrder((prev) => (prev ? { ...prev, status: "cancelled" } : null));
      setShowCancelConfirm(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || "Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  const handleReorder = async () => {
    if (!order) return;

    try {
      for (const item of order.items) {
        await httpClient.post("/api/cart/", {
          product_id: item.product,
          quantity: parseFloat(item.quantity),
        });
      }
      // Redirect to cart
      window.location.href = "/cart";
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || "Failed to reorder items");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: string) => {
    return `£${parseFloat(amount).toFixed(2)}`;
  };

  if (!user) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">🔐</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Please sign in to view order details
            </h2>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="mb-6 text-4xl animate-spin">⏳</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Loading order details...
            </h2>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="mb-6 text-8xl">❌</div>
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Order not found
            </h2>
            <p
              className="mb-8 max-w-md mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              {error ||
                "The order you're looking for doesn't exist or you don't have permission to view it."}
            </p>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Back to Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[order.status];
  const canCancel = order.status === "pending" || order.status === "paid";
  const canReorder =
    order.status === "paid" ||
    order.status === "cancelled" ||
    order.status === "delivered";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <Link
                href="/orders"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors mb-4"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Orders
              </Link>
              <div className="flex items-center gap-4 mb-2">
                <h1
                  className="text-3xl font-bold"
                  style={{ color: "var(--foreground)" }}
                >
                  Order #{order.id}
                </h1>
                <div
                  className={`px-4 py-2 rounded-full text-sm font-medium ${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor} border`}
                >
                  <span className="mr-2">{statusInfo.icon}</span>
                  {statusInfo.label}
                </div>
              </div>
              <p
                className="text-lg"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                {statusInfo.description}
              </p>
              <p
                className="mt-2"
                style={{ color: "var(--foreground)", opacity: 0.6 }}
              >
                Placed on {formatDate(order.order_date)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="xl:col-span-2 space-y-8">
            {/* Order Timeline */}
            <div
              className="rounded-2xl shadow-sm p-6"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <OrderTimeline order={order} />
            </div>

            {/* Enhanced Order Items */}
            <div
              className="rounded-2xl shadow-sm"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    Order Items
                  </h2>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{
                      background: "var(--sidebar-bg)",
                      color: "var(--foreground)",
                    }}
                  >
                    {order.total_items}{" "}
                    {order.total_items === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="space-y-4">
                  {order.items.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Order Summary Sidebar */}
          <div className="xl:col-span-1 space-y-6">
            {/* Order Summary Card */}
            <div
              className="rounded-2xl shadow-sm"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <div className="p-6">
                <h2
                  className="text-xl font-semibold mb-6"
                  style={{ color: "var(--foreground)" }}
                >
                  Order Summary
                </h2>

                {/* Order Details */}
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Order Date
                      </p>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {formatDate(order.order_date)}
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Delivery Date
                      </p>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {formatDate(order.delivery_date)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Delivery Type
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {order.is_home_delivery ? "🏠" : "🏪"}
                      </span>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        Home Delivery
                      </p>
                    </div>
                  </div>

                  {order.customer_address && (
                    <div>
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Delivery Address
                      </p>
                      <p
                        className="text-sm p-3 rounded-lg"
                        style={{
                          background: "var(--sidebar-bg)",
                          color: "var(--foreground)",
                        }}
                      >
                        {order.customer_address}
                      </p>
                    </div>
                  )}
                </div>

                {/* Enhanced Price Breakdown */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                      Subtotal:
                    </span>
                    <span style={{ color: "var(--foreground)" }}>
                      {formatCurrency(
                        (
                          parseFloat(order.total_price) -
                          parseFloat(order.delivery_fee) +
                          parseFloat(order.discount)
                        ).toFixed(2)
                      )}
                    </span>
                  </div>

                  {parseFloat(order.delivery_fee) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Delivery:
                      </span>
                      <span style={{ color: "var(--foreground)" }}>
                        {formatCurrency(order.delivery_fee)}
                      </span>
                    </div>
                  )}

                  {parseFloat(order.discount) > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount:</span>
                      <span>-{formatCurrency(order.discount)}</span>
                    </div>
                  )}

                  <div
                    className="flex justify-between text-xl font-bold pt-4"
                    style={{ borderTop: "2px solid var(--sidebar-border)" }}
                  >
                    <span style={{ color: "var(--foreground)" }}>Total:</span>
                    <span style={{ color: "var(--foreground)" }}>
                      {formatCurrency(order.total_price)}
                    </span>
                  </div>
                </div>

                {/* Enhanced Action Buttons */}
                <div className="space-y-3">
                  {canReorder && (
                    <button
                      onClick={handleReorder}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all duration-200 hover:shadow-lg"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                        />
                      </svg>
                      Reorder Items
                    </button>
                  )}

                  {canCancel && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-300 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 transition-all duration-200"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      Cancel Order
                    </button>
                  )}

                  {order.invoice_link && (
                    <a
                      href={order.invoice_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all duration-200"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      View Invoice
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Enhanced Order Notes */}
            {order.notes && (
              <div
                className="rounded-2xl shadow-sm"
                style={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--sidebar-border)",
                }}
              >
                <div className="p-6">
                  <h3
                    className="text-lg font-semibold mb-3"
                    style={{ color: "var(--foreground)" }}
                  >
                    Order Notes
                  </h3>
                  <div
                    className="p-4 rounded-xl"
                    style={{
                      background: "var(--sidebar-bg)",
                      color: "var(--foreground)",
                    }}
                  >
                    <p className="text-sm leading-relaxed">{order.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Cancel Confirmation Modal */}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
              style={{ background: "var(--card-bg)" }}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <h3
                  className="text-xl font-bold mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  Cancel Order #{order.id}
                </h3>
                <p
                  className="text-sm"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  Are you sure you want to cancel this order? This action cannot
                  be undone.
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="flex-1 bg-red-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Yes, Cancel Order"}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 border-2 border-gray-300 text-gray-700 py-3 px-4 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                >
                  Keep Order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

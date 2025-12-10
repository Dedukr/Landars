"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { httpClient } from "@/utils/httpClient";
import { Button } from "@/components/ui/Button";
import LoadingSpinner from "@/components/LoadingSpinner";
import OrderReviewItem from "@/components/OrderReviewItem";

interface OrderItem {
  id: number;
  product?: {
    id: number;
    name: string;
    price: string;
    image_url?: string | null;
    description?: string;
  };
  product_name?: string;
  product_price?: string;
  product_image_url?: string | null;
  quantity: number;
  get_total_price?: string;
  total_price?: string;
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
  payment_intent_id?: string;
  payment_status?: string;
  // Shipping fields
  shipping_method_id?: number;
  shipping_carrier?: string;
  shipping_service_name?: string;
  shipping_cost?: string;
  shipping_tracking_number?: string;
  shipping_tracking_url?: string;
  shipping_label_url?: string;
  sendcloud_parcel_id?: number;
  shipping_status?: string;
  shipping_error_message?: string;
}

const statusConfig = {
  pending: {
    label: "Pending",
    description: "Your order is being processed",
    icon: "⏳",
    color: "var(--accent)",
    bgColor: "rgba(217, 164, 65, 0.1)",
    borderColor: "rgba(217, 164, 65, 0.3)",
    progress: 25,
  },
  paid: {
    label: "Confirmed",
    description: "Payment confirmed, preparing for delivery",
    icon: "✅",
    color: "var(--success)",
    bgColor: "rgba(22, 163, 74, 0.1)",
    borderColor: "rgba(22, 163, 74, 0.3)",
    progress: 50,
  },
  cancelled: {
    label: "Cancelled",
    description: "This order has been cancelled",
    icon: "❌",
    color: "var(--destructive)",
    bgColor: "rgba(220, 38, 38, 0.1)",
    borderColor: "rgba(220, 38, 38, 0.3)",
    progress: 0,
  },
};

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
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--background)" }}
      >
        <div className="text-center max-w-md w-full">
          <div className="mb-6 text-6xl">❌</div>
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: "var(--foreground)" }}
          >
            {error || "Order not found"}
          </h2>
          <p
            className="mb-8 text-sm"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            {error ||
              "The order you're looking for doesn't exist or you don't have permission to view it."}
          </p>
          <Button onClick={() => router.push("/orders")}>
            View All Orders
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo =
    statusConfig[order.status as keyof typeof statusConfig] ||
    statusConfig.pending;
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // const formatTime = (dateString: string) => {
  //   return new Date(dateString).toLocaleTimeString("en-GB", {
  //     hour: "2-digit",
  //     minute: "2-digit",
  //   });
  // };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Hero Header Section */}
      <div
        className="border-b"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-[var(--sidebar-bg)] rounded-lg transition-colors"
                  aria-label="Go back"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: "var(--foreground)" }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <h1
                  className="text-3xl md:text-4xl font-bold"
                  style={{ color: "var(--foreground)" }}
                >
                  Order #{order.id}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {formatDate(order.order_date)}
                </span>
                <span style={{ color: "var(--muted-foreground)" }}>
                  order placed.
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div
              className="px-6 py-4 rounded-xl border-2 flex items-center gap-3"
              style={{
                background: statusInfo.bgColor,
                borderColor: statusInfo.borderColor,
              }}
            >
              <span className="text-2xl">{statusInfo.icon}</span>
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: statusInfo.color }}
                >
                  {statusInfo.label}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {statusInfo.description}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Success Confirmation Banner */}
            {order.status === "paid" && (
              <div
                className="rounded-xl p-6 border-2"
                style={{
                  background: statusInfo.bgColor,
                  borderColor: statusInfo.borderColor,
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ background: statusInfo.color }}
                    >
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3
                      className="text-lg font-semibold mb-1"
                      style={{ color: statusInfo.color }}
                    >
                      Order Confirmed Successfully!
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Thank you for your order. We&apos;ve received your payment
                      and will send you a confirmation email shortly. Your order
                      is being prepared and will be delivered on{" "}
                      {order.delivery_date
                        ? formatDate(order.delivery_date)
                        : "the selected date"}
                      .
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Order Items Section */}
            <div
              className="rounded-xl shadow-sm p-6 border"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="text-xl font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Order Items
                </h2>
                <span
                  className="text-sm px-3 py-1 rounded-full"
                  style={{
                    background: "var(--sidebar-bg)",
                    color: "var(--foreground)",
                  }}
                >
                  {order.total_items}{" "}
                  {order.total_items === 1 ? "item" : "items"}
                </span>
              </div>

              <div>
                {order.items.map((item) => {
                  // Format price - handle different possible field names
                  const productPrice =
                    item.product_price || item.product?.price || "0.00";
                  const totalPrice =
                    item.total_price ||
                    item.get_total_price ||
                    (
                      parseFloat(productPrice) *
                      parseFloat(item.quantity.toString())
                    ).toFixed(2);

                  // Ensure totalPrice is formatted correctly
                  const formattedTotalPrice =
                    typeof totalPrice === "string"
                      ? parseFloat(totalPrice).toFixed(2)
                      : Number(totalPrice).toFixed(2);

                  return (
                    <OrderReviewItem
                      key={item.id}
                      product={{
                        id: item.product?.id || item.id,
                        name:
                          item.product_name || item.product?.name || "Product",
                        price: productPrice,
                        image_url:
                          item.product_image_url ||
                          item.product?.image_url ||
                          null,
                        description: item.product?.description,
                      }}
                      quantity={parseFloat(item.quantity.toString())}
                      totalPrice={formattedTotalPrice}
                    />
                  );
                })}
              </div>
            </div>

            {/* Delivery Information */}
            <div
              className="rounded-xl shadow-sm p-6 border"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Delivery Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        style={{ color: "var(--accent)" }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        Delivery Address
                      </p>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {order.customer_address || "Address not provided"}
                    </p>
                  </div>

                  {order.delivery_date && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          style={{ color: "var(--accent)" }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          Delivery Date
                        </p>
                      </div>
                      <p
                        className="text-sm"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {formatDate(order.delivery_date)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        style={{ color: "var(--accent)" }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                        />
                      </svg>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        Delivery Type
                      </p>
                    </div>
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {order.is_home_delivery ? "Home Delivery" : "Collection"}
                    </p>
                  </div>

                  {order.notes && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          style={{ color: "var(--accent)" }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                          />
                        </svg>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          Special Instructions
                        </p>
                      </div>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {order.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Shipping Tracking Section */}
            {(order.shipping_tracking_number || 
              order.shipping_carrier || 
              order.shipping_status) && (
              <div
                className="rounded-xl shadow-sm p-6 border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                }}
              >
                <h2
                  className="text-xl font-semibold mb-6"
                  style={{ color: "var(--foreground)" }}
                >
                  Shipping Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Shipping Method */}
                  {(order.shipping_carrier || order.shipping_service_name) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          style={{ color: "var(--accent)" }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                          />
                        </svg>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          Shipping Method
                        </p>
                      </div>
                      <p
                        className="text-sm"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {order.shipping_carrier && order.shipping_service_name
                          ? `${order.shipping_carrier} - ${order.shipping_service_name}`
                          : order.shipping_carrier || order.shipping_service_name}
                      </p>
                    </div>
                  )}

                  {/* Shipping Status */}
                  {order.shipping_status && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          style={{ color: "var(--accent)" }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          Shipping Status
                        </p>
                      </div>
                      <p
                        className="text-sm capitalize"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {order.shipping_status.replace(/_/g, " ")}
                      </p>
                    </div>
                  )}

                  {/* Tracking Number */}
                  {order.shipping_tracking_number && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          style={{ color: "var(--accent)" }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          Tracking Number
                        </p>
                      </div>
                      {order.shipping_tracking_url ? (
                        <a
                          href={order.shipping_tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:underline inline-flex items-center gap-1"
                          style={{ color: "var(--accent)" }}
                        >
                          {order.shipping_tracking_number}
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
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ) : (
                        <p
                          className="text-sm font-mono"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {order.shipping_tracking_number}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Preparing Shipment Message */}
                  {!order.shipping_tracking_number && 
                   order.status === "paid" && 
                   order.shipping_method_id && (
                    <div className="md:col-span-2">
                      <div
                        className="rounded-lg p-4 border"
                        style={{
                          background: "rgba(217, 164, 65, 0.1)",
                          borderColor: "rgba(217, 164, 65, 0.3)",
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <svg
                            className="w-5 h-5 flex-shrink-0 mt-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            style={{ color: "var(--accent)" }}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <div>
                            <p
                              className="text-sm font-semibold mb-1"
                              style={{ color: "var(--foreground)" }}
                            >
                              Preparing Your Shipment
                            </p>
                            <p
                              className="text-sm"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              We&apos;re preparing your order for shipment. 
                              Tracking information will be available soon.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment Information */}
            {order.payment_intent_id && (
              <div
                className="rounded-xl shadow-sm p-6 border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                }}
              >
                <h2
                  className="text-xl font-semibold mb-6"
                  style={{ color: "var(--foreground)" }}
                >
                  Payment Information
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Payment Method
                    </span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      Card Payment
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Payment Status
                    </span>
                    <span
                      className="text-sm font-medium px-3 py-1 rounded-full"
                      style={{
                        background: statusInfo.bgColor,
                        color: statusInfo.color,
                      }}
                    >
                      {order.payment_status === "succeeded"
                        ? "Paid"
                        : order.payment_status || "Pending"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Order Summary */}
          <div className="lg:col-span-1">
            <div
              className="rounded-xl shadow-sm p-6 border sticky top-8"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <h2
                className="text-lg font-semibold mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                  <span
                    className="text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Subtotal ({order.total_items} items)
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    £
                    {order.sum_price
                      ? parseFloat(order.sum_price || "0").toFixed(2)
                      : (
                          order.items?.reduce((sum, item) => {
                            const price = parseFloat(
                              item.total_price || item.get_total_price || "0"
                            );
                            return sum + price;
                          }, 0) || 0
                        ).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span
                    className="text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Delivery Fee
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {parseFloat(order.delivery_fee) === 0
                      ? "Free"
                      : `£${parseFloat(order.delivery_fee).toFixed(2)}`}
                  </span>
                </div>

                {parseFloat(order.discount) > 0 && (
                  <div className="flex justify-between items-center">
                    <span
                      className="text-sm"
                      style={{ color: "var(--success)" }}
                    >
                      Discount
                    </span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--success)" }}
                    >
                      -£{parseFloat(order.discount).toFixed(2)}
                    </span>
                  </div>
                )}

                <div
                  className="pt-4 border-t"
                  style={{ borderColor: "var(--sidebar-border)" }}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className="text-base font-semibold"
                      style={{ color: "var(--foreground)" }}
                    >
                      Total
                    </span>
                    <span
                      className="text-xl font-bold"
                      style={{ color: "var(--foreground)" }}
                    >
                      £{parseFloat(order.total_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 mb-6">
                <Button
                  onClick={() => router.push("/orders")}
                  variant="outline"
                  fullWidth
                  size="lg"
                  icon={
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  }
                >
                  View All Orders
                </Button>

                {order.invoice_link && (
                  <Button
                    onClick={() => window.open(order.invoice_link, "_blank")}
                    variant="ghost"
                    fullWidth
                    size="lg"
                    icon={
                      <svg
                        className="w-5 h-5"
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
                    }
                  >
                    Download Invoice
                  </Button>
                )}
              </div>

              {/* Customer Support */}
              <div
                className="rounded-lg p-4 border"
                style={{
                  background: "var(--sidebar-bg)",
                  borderColor: "var(--sidebar-border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: "var(--accent)" }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  <div>
                    <p
                      className="text-sm font-semibold mb-1"
                      style={{ color: "var(--foreground)" }}
                    >
                      Need Help?
                    </p>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      If you have any questions about your order, please contact
                      our customer support team at{" "}
                      <a
                        href="mailto:support@foodplatform.com"
                        className="underline"
                        style={{ color: "var(--accent)" }}
                      >
                        support@foodplatform.com
                      </a>
                      .
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

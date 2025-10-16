"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";

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

interface OrderCardProps {
  order: Order;
  onReorder: () => void;
  onCancel: () => void;
}

const statusConfig = {
  pending: {
    label: "Pending",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    icon: "⏳",
  },
  paid: {
    label: "Paid",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: "✅",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "❌",
  },
};

export default function OrderCard({
  order,
  onReorder,
  onCancel,
}: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const statusInfo = statusConfig[order.status];
  const canCancel = order.status === "pending" || order.status === "paid";
  const canReorder = order.status === "paid" || order.status === "cancelled";

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: string) => {
    return `£${parseFloat(amount).toFixed(2)}`;
  };

  const handleCancelClick = () => {
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = () => {
    onCancel();
    setShowCancelConfirm(false);
  };

  const handleCancelCancel = () => {
    setShowCancelConfirm(false);
  };

  return (
    <div
      className="rounded-lg shadow-sm overflow-hidden"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Order Header */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="text-2xl">{statusInfo.icon}</div>
            <div>
              <h3
                className="text-lg font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Order #{order.id}
              </h3>
              <p
                className="text-sm"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Placed on {formatDate(order.order_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor} border`}
            >
              {statusInfo.label}
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              style={{ color: "var(--foreground)" }}
            >
              <svg
                className={`w-5 h-5 transform transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Order Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Delivery Date
            </p>
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              {formatDate(order.delivery_date)}
            </p>
          </div>
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Items
            </p>
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              {order.total_items} {order.total_items === 1 ? "item" : "items"}
            </p>
          </div>
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Total
            </p>
            <p
              className="text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {formatCurrency(order.total_price)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {canReorder && (
            <button
              onClick={onReorder}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
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
              Reorder
            </button>
          )}

          {canCancel && (
            <button
              onClick={handleCancelClick}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
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
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
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

          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
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
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            View Details
          </Link>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          className="px-6 py-4"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          {/* Order Items */}
          <div className="mb-6">
            <h4
              className="text-sm font-medium mb-3"
              style={{ color: "var(--foreground)" }}
            >
              Order Items
            </h4>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {item.product_image_url ? (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        width={48}
                        height={48}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-lg">🍎</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--foreground)" }}
                    >
                      {item.product_name}
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Qty: {item.quantity} ×{" "}
                      {formatCurrency(item.product_price)}
                    </p>
                  </div>
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {formatCurrency(item.total_price)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4
                className="text-sm font-medium mb-3"
                style={{ color: "var(--foreground)" }}
              >
                Delivery Information
              </h4>
              <div className="space-y-2">
                <p
                  className="text-sm"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  <span className="font-medium">Type:</span> Home Delivery
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  <span className="font-medium">Date:</span>{" "}
                  {formatDate(order.delivery_date)}
                </p>
                {order.customer_address && (
                  <p
                    className="text-sm"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    <span className="font-medium">Address:</span>{" "}
                    {order.customer_address}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4
                className="text-sm font-medium mb-3"
                style={{ color: "var(--foreground)" }}
              >
                Order Summary
              </h4>
              <div className="space-y-2">
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
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
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
                  className="flex justify-between text-sm font-semibold pt-2"
                  style={{ borderTop: "1px solid var(--sidebar-border)" }}
                >
                  <span style={{ color: "var(--foreground)" }}>Total:</span>
                  <span style={{ color: "var(--foreground)" }}>
                    {formatCurrency(order.total_price)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="mt-6">
              <h4
                className="text-sm font-medium mb-3"
                style={{ color: "var(--foreground)" }}
              >
                Order Notes
              </h4>
              <p
                className="text-sm p-3 rounded-lg"
                style={{
                  background: "var(--sidebar-bg)",
                  color: "var(--foreground)",
                  opacity: 0.8,
                }}
              >
                {order.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            style={{ background: "var(--card-bg)" }}
          >
            <h3
              className="text-lg font-semibold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Cancel Order #{order.id}
            </h3>
            <p
              className="text-sm mb-6"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Are you sure you want to cancel this order? This action cannot be
              undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleCancelConfirm}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Yes, Cancel Order
              </button>
              <button
                onClick={handleCancelCancel}
                className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Keep Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

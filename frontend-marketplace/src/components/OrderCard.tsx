"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronDown,
  RotateCcw,
  Eye,
  Download,
  MessageCircle,
  X,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

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
  delivery_date: string | null;
  is_home_delivery: boolean;
  delivery_fee: string;
  discount: string;
  created_at: string;
  status: "pending" | "paid" | "issued" | "cancelled";
  invoice_link?: string;
  items: OrderItem[];
  total_price: string;
  total_items: number;
}

interface OrderCardProps {
  order: Order;
  onReorder: () => void;
}

function getWhatsAppUrl(phone: string | undefined, text?: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits.length) return null;
  const base = `https://api.whatsapp.com/send?phone=${digits}`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatCurrency(amount: string) {
  return `£${parseFloat(amount).toFixed(2)}`;
}

export default function OrderCard({ order, onReorder }: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const canCancel =
    order.status === "pending" ||
    order.status === "paid" ||
    order.status === "issued";
  const canReorder =
    order.status === "paid" ||
    order.status === "issued" ||
    order.status === "cancelled";

  const cancelWhatsAppUrl = getWhatsAppUrl(
    process.env.NEXT_PUBLIC_SUPPORT_PHONE,
    `Cancelling the order #${order.id}`
  );

  return (
    <div
      className="rounded-xl overflow-hidden transition-shadow hover:shadow-md"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* ── Header ──────────────────────────────────── */}
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Order #{order.id}
              </span>
              <StatusBadge status={order.status} size="sm" />
            </div>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Placed on {formatDate(order.created_at)}
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg transition-all duration-200 hover:opacity-80 flex-shrink-0"
            style={{
              color: "var(--muted-foreground)",
              background: "var(--sidebar-bg)",
            }}
            aria-label={isExpanded ? "Collapse order" : "Expand order"}
            aria-expanded={isExpanded}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Summary row */}
        <div
          className="grid grid-cols-3 gap-4 mb-4 py-3 px-4 rounded-lg"
          style={{ background: "var(--sidebar-bg)" }}
        >
          <div>
            <p
              className="text-xs mb-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Delivery
            </p>
            <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              {order.delivery_date ? formatDate(order.delivery_date) : "TBC"}
            </p>
          </div>
          <div>
            <p
              className="text-xs mb-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Items
            </p>
            <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              {order.total_items} {order.total_items === 1 ? "item" : "items"}
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-xs mb-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Total
            </p>
            <p
              className="text-sm font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {formatCurrency(order.total_price)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canReorder && (
            <button
              onClick={onReorder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:opacity-90"
              style={{ background: "var(--primary)", color: "white" }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reorder
            </button>
          )}

          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:opacity-80"
            style={{
              borderColor: "var(--sidebar-border)",
              color: "var(--foreground)",
              background: "transparent",
            }}
          >
            <Eye className="w-3.5 h-3.5" />
            View Details
          </Link>

          {order.invoice_link && (
            <a
              href={order.invoice_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
                background: "var(--success-bg)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Invoice
            </a>
          )}

          {canCancel && cancelWhatsAppUrl && (
            <a
              href={cancelWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: "rgba(220,38,38,0.3)",
                color: "var(--destructive)",
                background: "rgba(220,38,38,0.06)",
              }}
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </a>
          )}

          {canCancel && !cancelWhatsAppUrl && (
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: "rgba(220,38,38,0.3)",
                color: "var(--destructive)",
                background: "rgba(220,38,38,0.06)",
              }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Request Cancel
            </Link>
          )}
        </div>
      </div>

      {/* ── Expanded detail ─────────────────────────── */}
      {isExpanded && (
        <div
          className="px-5 sm:px-6 pb-6"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          {/* Items list */}
          <div className="mt-5 mb-5">
            <h4
              className="text-xs font-semibold uppercase tracking-wide mb-3"
              style={{ color: "var(--muted-foreground)" }}
            >
              Items Ordered
            </h4>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {item.product_image_url ? (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        width={44}
                        height={44}
                        className="w-11 h-11 object-cover rounded-lg"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-lg"
                        style={{ background: "var(--sidebar-bg)" }}
                      >
                        🛒
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
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {item.quantity} × {formatCurrency(item.product_price)}
                    </p>
                  </div>
                  <div
                    className="text-sm font-semibold flex-shrink-0"
                    style={{ color: "var(--foreground)" }}
                  >
                    {formatCurrency(item.total_price)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order detail grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h4
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Delivery
              </h4>
              <div className="space-y-1 text-sm" style={{ color: "var(--foreground)" }}>
                <p>
                  <span style={{ color: "var(--muted-foreground)" }}>
                    Type:{" "}
                  </span>
                  {order.is_home_delivery ? "Home Delivery" : "Post / Collection"}
                </p>
                <p>
                  <span style={{ color: "var(--muted-foreground)" }}>
                    Date:{" "}
                  </span>
                  {order.delivery_date ? formatDate(order.delivery_date) : "Not specified"}
                </p>
                {order.customer_address && (
                  <p>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      Address:{" "}
                    </span>
                    {order.customer_address}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Price Breakdown
              </h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--muted-foreground)" }}>Subtotal</span>
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
                    <span style={{ color: "var(--muted-foreground)" }}>Delivery</span>
                    <span style={{ color: "var(--foreground)" }}>
                      {formatCurrency(order.delivery_fee)}
                    </span>
                  </div>
                )}
                {parseFloat(order.discount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--success)" }}>Discount</span>
                    <span style={{ color: "var(--success)" }}>
                      -{formatCurrency(order.discount)}
                    </span>
                  </div>
                )}
                <div
                  className="flex justify-between text-sm font-semibold pt-2 mt-1"
                  style={{ borderTop: "1px solid var(--sidebar-border)" }}
                >
                  <span style={{ color: "var(--foreground)" }}>Total</span>
                  <span style={{ color: "var(--foreground)" }}>
                    {formatCurrency(order.total_price)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="mt-4">
              <h4
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Notes
              </h4>
              <p
                className="text-sm px-3 py-2.5 rounded-lg"
                style={{
                  background: "var(--sidebar-bg)",
                  color: "var(--foreground)",
                }}
              >
                {order.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

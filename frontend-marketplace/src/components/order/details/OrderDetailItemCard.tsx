"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ImageOff } from "lucide-react";
import { formatGbpPrice } from "@/lib/formatPrice";
import type { OrderDetailItem } from "@/lib/orderDetailTypes";
function safeLineTotal(item: OrderDetailItem): string | null {
  const direct =
    item.total_price ?? item.get_total_price ?? null;
  if (direct != null && String(direct).trim() !== "") {
    const p = parseFloat(String(direct));
    if (Number.isFinite(p)) return p.toFixed(2);
  }
  const unitRaw = item.product_price ?? item.product?.price;
  if (unitRaw == null) return null;
  const unit = parseFloat(String(unitRaw));
  const qty = parseFloat(String(item.quantity));
  if (!Number.isFinite(unit) || !Number.isFinite(qty)) return null;
  return (unit * qty).toFixed(2);
}

function unitPrice(item: OrderDetailItem): string | null {
  const raw = item.product_price ?? item.product?.price;
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export function OrderDetailItemCard({ item }: { item: OrderDetailItem }) {
  const name =
    item.product_name?.trim() ||
    item.product?.name?.trim() ||
    "Product";
  const imageUrl =
    item.product_image_url?.trim() ||
    item.product?.image_url?.trim() ||
    null;
  const productId = item.product?.id;
  const qty = parseFloat(String(item.quantity));
  const qtyLabel = Number.isFinite(qty) ? qty : item.quantity;
  const line = safeLineTotal(item);
  const each = unitPrice(item);
  const lineFormatted = line != null ? formatGbpPrice(line) : null;
  const eachFormatted = each != null ? formatGbpPrice(each) : null;

  const inner = (
    <div
      className="flex gap-3 rounded-2xl border p-3 transition-colors sm:gap-4 sm:p-4"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 80px, 96px"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "var(--card-bg)" }}
            aria-hidden
          >
            <ImageOff
              className="h-8 w-8"
              style={{ color: "var(--muted-foreground)" }}
            />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className="text-base font-semibold leading-snug sm:text-lg"
              style={{ color: "var(--foreground)" }}
            >
              {name}
            </h3>
            {item.product?.description ? (
              <p
                className="mt-1 line-clamp-2 text-xs sm:text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                {item.product.description}
              </p>
            ) : null}
          </div>
          {productId ? (
            <ChevronRight
              className="mt-1 h-5 w-5 shrink-0 opacity-40 sm:hidden"
              aria-hidden
            />
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span
            className="inline-flex min-h-[32px] items-center rounded-lg px-2.5 py-1 text-xs font-semibold sm:text-sm"
            style={{
              background: "var(--card-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--sidebar-border)",
            }}
          >
            Qty {qtyLabel}
          </span>
          {eachFormatted ? (
            <span style={{ color: "var(--muted-foreground)" }}>
              {eachFormatted} each
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-start pt-0.5">
        {lineFormatted ? (
          <p
            className="text-base font-bold tabular-nums sm:text-lg"
            style={{ color: "var(--foreground)" }}
          >
            {lineFormatted}
          </p>
        ) : (
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            —
          </span>
        )}
      </div>
    </div>
  );

  if (productId) {
    return (
      <Link
        href={`/product/${productId}`}
        aria-label={`View ${name}`}
        className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)]"
      >
        {inner}
      </Link>
    );
  }

  return <div>{inner}</div>;
}

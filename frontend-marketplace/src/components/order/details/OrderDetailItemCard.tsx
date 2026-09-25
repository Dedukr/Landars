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
  const nestedPrice =
    item.product && typeof item.product === "object" ? item.product.price : null;
  const unitRaw = item.product_price ?? nestedPrice;
  if (unitRaw == null) return null;
  const unit = parseFloat(String(unitRaw));
  const qty = parseFloat(String(item.quantity));
  if (!Number.isFinite(unit) || !Number.isFinite(qty)) return null;
  return (unit * qty).toFixed(2);
}

function unitPrice(item: OrderDetailItem): string | null {
  const nestedPrice =
    item.product && typeof item.product === "object" ? item.product.price : null;
  const raw = item.product_price ?? nestedPrice;
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function freeQuantity(item: OrderDetailItem): number {
  const n = parseFloat(String(item.free_quantity ?? "0"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function linePromoDiscount(item: OrderDetailItem): number {
  const n = parseFloat(String(item.promo_discount ?? "0"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolveProductId(item: OrderDetailItem): number | null {
  const p = item.product;
  if (p == null) return null;
  if (typeof p === "number" && Number.isFinite(p) && p > 0) return p;
  if (typeof p === "object" && typeof p.id === "number" && p.id > 0) return p.id;
  return null;
}

export function OrderDetailItemCard({ item }: { item: OrderDetailItem }) {
  const nestedProduct =
    item.product && typeof item.product === "object" ? item.product : null;
  const name =
    item.product_name?.trim() ||
    nestedProduct?.name?.trim() ||
    "Product";
  const imageUrl =
    item.product_image_url?.trim() ||
    nestedProduct?.image_url?.trim() ||
    null;
  const productId = resolveProductId(item);
  const qty = parseFloat(String(item.quantity));
  const qtyLabel = Number.isFinite(qty) ? qty : item.quantity;
  const line = safeLineTotal(item);
  const each = unitPrice(item);
  const lineFormatted = line != null ? formatGbpPrice(line) : null;
  const eachFormatted = each != null ? formatGbpPrice(each) : null;
  const free = freeQuantity(item);
  const promoOff = linePromoDiscount(item);

  const inner = (
    <div
      className={`flex gap-3 rounded-2xl border p-3 transition-colors sm:gap-4 sm:p-4${
        productId ? " hover:border-[var(--accent)]/50 hover:bg-[var(--card-bg)]" : ""
      }`}
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
              className={`text-base font-semibold leading-snug sm:text-lg${
                productId ? " underline-offset-2 group-hover:underline" : ""
              }`}
              style={{ color: "var(--foreground)" }}
            >
              {name}
            </h3>
            {nestedProduct?.description ? (
              <p
                className="mt-1 line-clamp-2 text-xs sm:text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                {nestedProduct.description}
              </p>
            ) : null}
          </div>
          {productId ? (
            <ChevronRight
              className="mt-1 h-5 w-5 shrink-0 opacity-40 transition-opacity group-hover:opacity-70"
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
          {free > 0 ? (
            <span
              className="inline-flex min-h-[32px] items-center rounded-lg px-2.5 py-1 text-xs font-bold sm:text-sm"
              style={{
                background: "var(--success-bg)",
                color: "var(--success-text)",
                border: "1px solid var(--success-border)",
              }}
            >
              {free} free
            </span>
          ) : null}
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
        {promoOff > 0 ? (
          <p
            className="mt-1 text-xs font-semibold tabular-nums"
            style={{ color: "var(--success-text)" }}
          >
            −£{promoOff.toFixed(2)} (5+1 offer)
          </p>
        ) : null}
      </div>
    </div>
  );

  if (productId) {
    return (
      <Link
        href={`/product/${productId}`}
        aria-label={`View ${name}`}
        className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)]"
      >
        {inner}
      </Link>
    );
  }

  return <div>{inner}</div>;
}

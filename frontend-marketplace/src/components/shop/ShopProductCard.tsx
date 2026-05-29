"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AddToCartButton } from "@/components/ui/AddToCartButton";

export interface ShopProductDto {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
  categories?: string[];
  stock_quantity?: number;
  sold_quantity?: number;
  sold_orders_count?: number;
}

function collectImageUrls(product: ShopProductDto): string[] {
  if (product.images && product.images.length > 0) {
    const mapped = product.images
      .map((img) => {
        if (typeof img === "string") return img;
        if (img && typeof img === "object" && img !== null && "image_url" in img)
          return String((img as { image_url: string }).image_url);
        return null;
      })
      .filter((url): url is string => Boolean(url?.trim()));
    if (mapped.length) return mapped;
  }
  const single = product.image_url || product.primary_image;
  return single ? [single] : [];
}

interface ShopProductCardProps {
  product: ShopProductDto;
  user: { id: number } | null;
  cartItemQuantity: number;
  inWishlist: boolean;
  onWishlistToggle: () => void;
  onAddToCart: (e?: React.MouseEvent) => void;
  onRemoveFromCart: (e?: React.MouseEvent) => void;
}

export function ShopProductCard({
  product,
  user,
  cartItemQuantity,
  inWishlist,
  onWishlistToggle,
  onAddToCart,
  onRemoveFromCart,
}: ShopProductCardProps) {
  const urls = collectImageUrls(product);
  const mainImage = urls[0] ?? null;
  const categoryLabel =
    product.categories && product.categories.length > 0
      ? product.categories[0]
      : null;

  const priceNum = product.price ? parseFloat(String(product.price)) : NaN;
  const priceDisplay = Number.isFinite(priceNum)
    ? `£${priceNum.toFixed(2)}`
    : "See details";

  const outOfStock =
    typeof product.stock_quantity === "number" && product.stock_quantity <= 0;

  return (
    <article
      className={[
        "group relative flex flex-col rounded-xl sm:rounded-2xl border overflow-hidden shadow-sm transition-all duration-200",
        "hover:shadow-lg sm:hover:-translate-y-0.5",
        "min-h-0 sm:min-h-[22rem]",
        "focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--background)]",
      ].join(" ")}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        color: "var(--foreground)",
      }}
      data-product-id={product.id}
    >
      <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 z-10">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWishlistToggle();
          }}
          className="inline-flex items-center justify-center w-8 h-8 sm:w-11 sm:h-11 rounded-full backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
            boxShadow: "var(--card-shadow)",
            color: inWishlist ? "var(--destructive)" : "var(--muted-foreground)",
          }}
          aria-label={
            user
              ? inWishlist
                ? "Remove from wishlist"
                : "Save to wishlist"
              : "Sign in to save to wishlist"
          }
          aria-pressed={inWishlist}
        >
          <Heart
            className={`w-4 h-4 sm:w-5 sm:h-5 ${inWishlist ? "fill-current" : ""}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>

      <Link
        href={`/product/${product.id}/`}
        className="relative block shrink-0 aspect-[4/3] w-full outline-none bg-[var(--sidebar-bg)]"
        aria-label={`View ${product.name}`}
      >
        {mainImage ? (
          <Image
            src={mainImage}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 24vw"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 sm:gap-2 p-3 sm:p-4 text-center">
            <Package className="w-7 h-7 sm:w-10 sm:h-10 opacity-35" aria-hidden />
            <span
              className="text-[10px] sm:text-xs font-medium"
              style={{ color: "var(--muted-foreground)" }}
            >
              Photo coming soon
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 hidden sm:flex flex-wrap gap-1.5 px-3 pb-3 pt-6 bg-gradient-to-t from-black/50 to-transparent opacity-95 pointer-events-none">
          {categoryLabel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: "var(--info-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              {categoryLabel}
            </span>
          )}
          {urls.length > 1 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: "var(--card-bg)",
                color: "var(--muted-foreground)",
              }}
            >
              {urls.length} photos
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-2.5 pt-2 sm:p-4 sm:pt-3">
        <Link
          href={`/product/${product.id}/`}
          prefetch={false}
          className="outline-none rounded-md focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <h3
            className="font-semibold text-xs sm:text-base leading-snug line-clamp-2 mb-1 sm:mb-2"
            style={{ color: "var(--foreground)" }}
          >
            {product.name}
          </h3>
          {product.description ? (
            <p
              className="hidden sm:block text-sm leading-relaxed line-clamp-2 mb-4"
              style={{ color: "var(--muted-foreground)" }}
            >
              {product.description}
            </p>
          ) : (
            <div className="hidden sm:block mb-4" />
          )}
        </Link>

        <div
          className="mt-auto flex flex-col gap-2 sm:gap-3 pt-2 border-t"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="flex items-end justify-between gap-2">
            <div>
              <p
                className="hidden sm:block text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                Price
              </p>
              <p
                className="text-base sm:text-xl font-bold tabular-nums"
                style={{ color: "var(--primary)" }}
              >
                {priceDisplay}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Link
              href={`/product/${product.id}/`}
              prefetch={false}
              className="hidden sm:inline text-sm font-medium underline-offset-4 hover:underline shrink-0"
              style={{ color: "var(--accent)" }}
            >
              View details
            </Link>
            <div className="flex-1 min-w-0 flex justify-end">
              {cartItemQuantity > 0 ? (
                <AddToCartButton
                  compact
                  inCart
                  quantity={cartItemQuantity}
                  onAdd={onAddToCart}
                  onRemove={onRemoveFromCart}
                />
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={outOfStock}
                  onClick={onAddToCart}
                  className="w-full sm:w-auto min-h-[36px] sm:min-h-[44px] text-xs sm:text-sm px-2 sm:px-3"
                >
                  {outOfStock ? "Unavailable" : "Add to basket"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

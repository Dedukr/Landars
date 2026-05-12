"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useCallback } from "react";
import { HeartOff, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/contexts/CartContext";
import { getPrimaryProductImageUrl } from "@/lib/productImageUrl";
import { formatGbpPrice } from "@/lib/formatPrice";
import type { WishlistProduct } from "@/lib/wishlistTypes";

interface WishlistItemCardProps {
  product: WishlistProduct;
  isRemoving: boolean;
  isSelected: boolean;
  onRemove: (productId: number) => void;
  onSelect: (productId: number, selected: boolean) => void;
  onAddedToBasket?: (productName: string) => void;
}

function AvailabilityBadge({
  inStock,
  stockQuantity,
}: {
  inStock?: boolean;
  stockQuantity?: number;
}) {
  const out =
    typeof stockQuantity === "number"
      ? stockQuantity <= 0
      : inStock === false;

  if (!out && inStock !== true && typeof stockQuantity !== "number") {
    return null;
  }

  if (!out) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          background: "var(--success-bg)",
          color: "var(--success-text)",
          border: "1px solid var(--success-border)",
        }}
      >
        In stock
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: "var(--sidebar-bg)",
        color: "var(--muted-foreground)",
        border: "1px solid var(--sidebar-border)",
      }}
    >
      Unavailable
    </span>
  );
}

export const WishlistItemCard = memo(function WishlistItemCard({
  product,
  isRemoving,
  isSelected,
  onRemove,
  onSelect,
  onAddedToBasket,
}: WishlistItemCardProps) {
  const { addToCart } = useCart();
  const imageUrl = getPrimaryProductImageUrl(product);
  const displayName =
    typeof product.name === "string" && product.name.trim()
      ? product.name.trim()
      : "Product";

  const priceLabel = formatGbpPrice(product.price);
  const originalFmt = formatGbpPrice(product.original_price);
  const priceNum = product.price ? parseFloat(String(product.price)) : NaN;
  const originalNum = product.original_price ? parseFloat(String(product.original_price)) : NaN;
  const showStrikeThrough =
    originalFmt &&
    Number.isFinite(priceNum) &&
    Number.isFinite(originalNum) &&
    originalNum > priceNum;

  const categoryLabel =
    product.categories && product.categories.length > 0 ? product.categories[0] : null;

  const outOfStock =
    typeof product.stock_quantity === "number"
      ? product.stock_quantity <= 0
      : product.in_stock === false;

  const handleAddToBasket = useCallback(() => {
    addToCart(product.id, 1);
    onAddedToBasket?.(displayName);
  }, [addToCart, product.id, displayName, onAddedToBasket]);

  const handleRemove = useCallback(() => {
    onRemove(product.id);
  }, [onRemove, product.id]);

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSelect(product.id, e.target.checked);
    },
    [onSelect, product.id]
  );

  return (
    <article
      className={[
        "group relative flex flex-col rounded-2xl border overflow-hidden shadow-sm transition-all duration-300",
        "hover:shadow-md md:hover:-translate-y-0.5",
        isRemoving ? "opacity-0 scale-[0.98]" : "opacity-100",
        "focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--background)]",
      ].join(" ")}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        color: "var(--foreground)",
        minHeight: "17rem",
      }}
    >
      <div className="relative shrink-0 aspect-[4/3] w-full bg-[var(--sidebar-bg)]">
        <Link
          href={`/product/${product.id}/`}
          className="absolute inset-0 z-0 block outline-none bg-[var(--sidebar-bg)]"
          aria-label={`View ${displayName}`}
        >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={displayName}
            fill
            className="object-cover transition-transform duration-300 md:group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <Package className="w-9 h-9 opacity-35" aria-hidden />
            <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Photo coming soon
            </span>
          </div>
        )}
        </Link>

        <div className="absolute top-2.5 left-2.5 z-20 pointer-events-auto">
          <label
            className="inline-flex cursor-pointer rounded-full bg-[var(--card-bg)]/95 border border-[var(--sidebar-border)] min-w-[44px] min-h-[44px] items-center justify-center shadow-sm backdrop-blur-sm hover:opacity-95 active:scale-95 transition-transform"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleSelectChange}
              onClick={(e) => e.stopPropagation()}
              className="h-6 w-6 rounded-md shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              style={{ accentColor: "var(--primary)" }}
              aria-label={`Select ${displayName} for bulk actions`}
            />
          </label>
        </div>

        <div className="absolute top-2.5 right-2.5 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full backdrop-blur-sm transition-transform active:scale-95 hover:opacity-90"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
              boxShadow: "var(--card-shadow)",
              color: "var(--destructive)",
            }}
            aria-label={`Remove ${displayName} from wishlist`}
          >
            <HeartOff className="w-5 h-5" aria-hidden strokeWidth={2} />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap gap-1.5 px-3 pb-3 pt-8 bg-gradient-to-t from-black/45 to-transparent pointer-events-none">
          {categoryLabel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: "var(--info-bg)",
                color: "var(--info-text)",
                border: "1px solid var(--info-border)",
              }}
            >
              {categoryLabel}
            </span>
          )}
          <AvailabilityBadge inStock={product.in_stock} stockQuantity={product.stock_quantity} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 pt-3 gap-3">
        <Link
          href={`/product/${product.id}/`}
          prefetch={false}
          className="outline-none rounded-md min-w-0"
        >
          <h2
            className="font-semibold text-base leading-snug line-clamp-2 mb-1"
            style={{ color: "var(--foreground)" }}
          >
            {displayName}
          </h2>
          {product.description != null &&
            typeof product.description === "string" &&
            product.description.trim().length > 0 && (
              <p
                className="text-sm leading-relaxed line-clamp-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                {product.description}
              </p>
            )}
        </Link>

        <div className="mt-auto pt-2 border-t space-y-3" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex flex-wrap items-baseline gap-2">
            {priceLabel ? (
              <p className="text-xl font-bold tabular-nums" style={{ color: "var(--primary)" }}>
                {priceLabel}
              </p>
            ) : (
              <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                Price on detail page
              </p>
            )}
            {showStrikeThrough && (
              <p className="text-sm line-through tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                {originalFmt}
              </p>
            )}
            {product.discount_percentage != null && Number(product.discount_percentage) > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                −{Math.round(Number(product.discount_percentage))}%
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              fullWidth
              disabled={Boolean(outOfStock)}
              onClick={handleAddToBasket}
              className="rounded-xl min-h-[48px]"
            >
              {outOfStock ? "Unavailable" : "Add to basket"}
            </Button>
            <Link
              href={`/product/${product.id}/`}
              prefetch={false}
              className="text-center text-sm font-semibold underline-offset-4 hover:underline py-1 min-h-[44px] inline-flex items-center justify-center rounded-md transition-colors hover:opacity-90"
              style={{ color: "var(--accent)" }}
            >
              View details
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
});

"use client";
import React, { memo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Minus, Plus, Trash2, Bookmark } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { getPrimaryProductImageUrl } from "@/lib/productImageUrl";
import { getAuthUrl } from "@/utils/authHelpers";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
  description?: string;
  categories?: string[];
}

interface CartItemCardProps {
  product: Product;
  quantity: number;
  isRemoving: boolean;
  onRemove: (productId: number) => void;
  onDecreaseQuantity: (productId: number) => void;
  onIncreaseQuantity: (productId: number) => void;
  onSaveForLater: (productId: number) => void;
}

const CartItemCard = memo<CartItemCardProps>(
  ({
    product,
    quantity,
    isRemoving,
    onRemove,
    onDecreaseQuantity,
    onIncreaseQuantity,
    onSaveForLater,
  }) => {
    const { addToWishlist } = useWishlist();
    const { user, token, loading: authLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const unitPrice = parseFloat(product.price) || 0;
    const lineTotal = unitPrice * quantity;
    const imageUrl = getPrimaryProductImageUrl(product);

    const handleSaveForLater = useCallback(async () => {
      if (authLoading) return;
      if (!user || !token) {
        const next = pathname && pathname.startsWith("/") ? pathname : "/cart";
        router.push(getAuthUrl({ mode: "signin", next }));
        return;
      }
      try {
        await addToWishlist(product.id);
      } catch {
        // Wishlist add failed silently; still move to saved list
      }
      onSaveForLater(product.id);
    }, [
      authLoading,
      user,
      token,
      router,
      pathname,
      addToWishlist,
      product.id,
      onSaveForLater,
    ]);

    return (
      <article
        className={`p-4 sm:p-5 transition-all duration-300 ${
          isRemoving
            ? "opacity-0 -translate-x-2 pointer-events-none"
            : "opacity-100 translate-x-0"
        }`}
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        aria-label={`${product.name || "Product"}, quantity ${quantity}`}
      >
        <div className="flex gap-3 sm:gap-4">
          {/* Product image */}
          <Link
            href={`/product/${product.id}`}
            className="shrink-0"
            tabIndex={-1}
            aria-hidden="true"
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={product.name || "Product image"}
                width={88}
                height={88}
                className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] object-cover rounded-xl"
              />
            ) : (
              <div
                className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-xl flex items-center justify-center text-2xl"
                style={{ background: "var(--sidebar-bg)" }}
                aria-hidden="true"
              >
                🍽️
              </div>
            )}
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Name + line total */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/product/${product.id}`}
                  className="font-semibold text-sm leading-snug hover:underline line-clamp-2 transition-colors"
                  style={{ color: "var(--foreground)" }}
                >
                  {product.name || "Product"}
                </Link>
                {product.categories && product.categories.length > 0 && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {product.categories[0]}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0 ml-2">
                <p
                  className="font-bold text-base leading-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  £{lineTotal.toFixed(2)}
                </p>
                {quantity > 1 && (
                  <p
                    className="text-xs leading-tight mt-0.5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    £{unitPrice.toFixed(2)} each
                  </p>
                )}
              </div>
            </div>

            {/* Quantity + actions */}
            <div className="mt-3 flex items-center justify-between gap-2">
              {/* Quantity stepper */}
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--sidebar-border)" }}
                role="group"
                aria-label={`Quantity controls for ${product.name || "item"}`}
              >
                <button
                  onClick={() => onDecreaseQuantity(product.id)}
                  disabled={quantity <= 1}
                  aria-label={`Decrease quantity of ${product.name || "item"}`}
                  className="flex items-center justify-center w-9 h-9 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--sidebar-bg)",
                    color: "var(--foreground)",
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span
                  className="w-9 text-center text-sm font-semibold select-none"
                  style={{ color: "var(--foreground)" }}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {quantity}
                </span>
                <button
                  onClick={() => onIncreaseQuantity(product.id)}
                  aria-label={`Increase quantity of ${product.name || "item"}`}
                  className="flex items-center justify-center w-9 h-9 transition-colors"
                  style={{
                    background: "var(--sidebar-bg)",
                    color: "var(--foreground)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Save / Remove */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleSaveForLater}
                  aria-label={`Save ${product.name || "item"} for later`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--sidebar-bg)]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <Bookmark className="w-3.5 h-3.5 shrink-0" />
                  <span>Save</span>
                </button>
                <button
                  onClick={() => onRemove(product.id)}
                  aria-label={`Remove ${product.name || "item"} from basket`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-70 active:scale-[0.97]"
                  style={{ color: "var(--destructive)" }}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }
);

CartItemCard.displayName = "CartItemCard";
export default CartItemCard;

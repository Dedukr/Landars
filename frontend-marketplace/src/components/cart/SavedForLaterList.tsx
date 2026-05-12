"use client";
import Image from "next/image";
import { Bookmark } from "lucide-react";
import { getPrimaryProductImageUrl } from "@/lib/productImageUrl";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
}

interface SavedForLaterListProps {
  savedItems: number[];
  getProduct: (productId: number) => Product | undefined;
  onMoveToCart: (productId: number) => void;
  onRemoveSaved: (productId: number) => void;
}

export default function SavedForLaterList({
  savedItems,
  getProduct,
  onMoveToCart,
  onRemoveSaved,
}: SavedForLaterListProps) {
  if (savedItems.length === 0) return null;

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="flex items-center gap-2 px-5 py-4"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <Bookmark
          className="w-4 h-4 shrink-0"
          style={{ color: "var(--accent)" }}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Saved for later
        </h2>
      </div>

      <div>
        {savedItems.map((productId) => {
          const product = getProduct(productId);
          if (!product) return null;

          const imageUrl = getPrimaryProductImageUrl(product);

          return (
            <div
              key={productId}
              className="flex items-center gap-3 p-4"
              style={{ borderBottom: "1px solid var(--sidebar-border)" }}
            >
              <div className="shrink-0">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={product.name || "Product"}
                    width={56}
                    height={56}
                    className="w-14 h-14 object-cover rounded-xl"
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: "var(--sidebar-bg)" }}
                    aria-hidden="true"
                  >
                    🍽️
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--foreground)" }}
                >
                  {product.name || "Product"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  £{parseFloat(product.price).toFixed(2)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onMoveToCart(productId)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ color: "var(--primary)" }}
                >
                  Move to basket
                </button>
                <button
                  onClick={() => onRemoveSaved(productId)}
                  className="text-xs font-medium px-2 py-1.5 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: "var(--destructive)" }}
                  aria-label={`Remove ${product.name || "item"} from saved`}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Package, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/contexts/AuthContext";
import { scopeProductsQueryString } from "@/utils/catalogScope";
import { Button } from "@/components/ui/Button";
import { collectProductImageUrls } from "@/components/product/collectProductImageUrls";
import type { ProductDetail } from "@/components/product/types";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  primary_image?: string | null;
  categories?: string[];
  stock_quantity?: number;
  in_stock?: boolean;
}

interface ProductRecommendationsProps {
  excludeProducts: Product[];
  /** Max items shown; capped at 4 for this block. */
  limit?: number;
  title?: string;
  /** Short line under the title; defaults to a neutral catalogue line. */
  subtitle?: string;
  showWishlist?: boolean;
  showQuickAdd?: boolean;
  className?: string;
  /** @deprecated Layout is responsive; value ignored. */
  gridCols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
}

function priceLabel(price: string): string | null {
  const n = price ? parseFloat(String(price)) : NaN;
  return Number.isFinite(n) ? `£${n.toFixed(2)}` : null;
}

function isOutOfStock(p: Product): boolean {
  if (p.in_stock === false) return true;
  return typeof p.stock_quantity === "number" && p.stock_quantity <= 0;
}

const ProductRecommendations: React.FC<ProductRecommendationsProps> = ({
  excludeProducts = [],
  limit = 4,
  title = "You might also like",
  subtitle = "Hand-picked suggestions from our catalogue.",
  showWishlist = false,
  showQuickAdd = true,
  className = "",
}) => {
  const itemCount = useMemo(() => Math.min(Math.max(limit, 1), 4), [limit]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { user } = useAuth();
  const lastFetchParams = useRef<string>("");
  const hasFetchedRef = useRef<boolean>(false);
  const initialExcludeIdsRef = useRef<string>("");

  const excludeIdsString = useMemo(() => {
    const ids = excludeProducts.map((p) => p.id).sort((a, b) => a - b);
    return ids.join(",");
  }, [excludeProducts]);

  useEffect(() => {
    if (!hasFetchedRef.current && excludeIdsString) {
      initialExcludeIdsRef.current = excludeIdsString;
    }
  }, [excludeIdsString]);

  const fetchRecommendations = useCallback(async () => {
    try {
      if (hasFetchedRef.current && products.length > 0) {
        return;
      }

      setIsLoading(true);

      const excludeIdsToUse = initialExcludeIdsRef.current
        ? initialExcludeIdsRef.current.split(",").map(Number)
        : excludeProducts.map((p) => p.id);

      const params = new URLSearchParams();
      params.append("limit", "500");
      if (excludeIdsToUse.length > 0) {
        params.append("exclude", excludeIdsToUse.join(","));
      }

      const currentParams = params.toString();
      if (lastFetchParams.current === currentParams && products.length > 0) {
        setIsLoading(false);
        return;
      }

      lastFetchParams.current = currentParams;

      let allProducts: Product[] = [];
      let offset = 0;
      const pageSize = 500;
      let hasMore = true;

      while (hasMore && allProducts.length < 1000) {
        const batchParams = new URLSearchParams();
        batchParams.append("limit", pageSize.toString());
        batchParams.append("offset", offset.toString());
        if (excludeIdsToUse.length > 0) {
          batchParams.append("exclude", excludeIdsToUse.join(","));
        }

        const scopedParams = scopeProductsQueryString(batchParams.toString());
        const response = await fetch(`/api/products/?${scopedParams}`);

        if (response.ok) {
          const data = await response.json();
          const batchProducts = Array.isArray(data) ? data : data.results || [];

          if (batchProducts.length === 0) {
            hasMore = false;
          } else {
            allProducts = [...allProducts, ...batchProducts];
            offset += pageSize;
            if (batchProducts.length < pageSize) {
              hasMore = false;
            }
          }
        } else {
          hasMore = false;
        }
      }

      const filteredProducts = allProducts.filter(
        (product: Product) => !excludeIdsToUse.includes(product.id)
      );

      const shuffledProducts = [...filteredProducts];
      for (let pass = 0; pass < 5; pass++) {
        for (let i = shuffledProducts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledProducts[i], shuffledProducts[j]] = [shuffledProducts[j], shuffledProducts[i]];
        }
      }

      const selectedProducts: Product[] = [];
      const availableIndices = shuffledProducts.map((_, index) => index);
      const selectionCount = Math.min(itemCount, shuffledProducts.length);
      for (let i = 0; i < selectionCount; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        const productIndex = availableIndices.splice(randomIndex, 1)[0];
        selectedProducts.push(shuffledProducts[productIndex]);
      }

      setProducts(selectedProducts);
      hasFetchedRef.current = true;
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [itemCount, excludeProducts, products.length]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleAddToCart = useCallback(
    (productId: number) => {
      addToCart(productId, 1);
    },
    [addToCart]
  );

  const handleWishlistClick = useCallback(
    (productId: number) => {
      if (!user) return;
      if (isInWishlist(productId)) {
        removeFromWishlist(productId);
      } else {
        addToWishlist(productId);
      }
    },
    [user, isInWishlist, addToWishlist, removeFromWishlist]
  );

  if (isLoading) {
    return (
      <section
        className={["rounded-2xl border p-5 sm:p-8", className].filter(Boolean).join(" ")}
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
        aria-busy="true"
        aria-label={title}
      >
        <div className="mb-6 h-7 w-48 rounded-lg animate-pulse" style={{ background: "var(--sidebar-border)" }} />
        <div className="mb-2 h-4 w-full max-w-md rounded animate-pulse" style={{ background: "var(--sidebar-border)" }} />
        <div className="flex gap-4 overflow-x-auto pb-2 pt-6 md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible">
          {Array.from({ length: itemCount }).map((_, index) => (
            <div key={index} className="w-[42vw] max-w-[200px] shrink-0 md:max-w-none md:w-auto">
              <div
                className="aspect-[4/3] rounded-2xl animate-pulse mb-3"
                style={{ background: "var(--sidebar-bg)" }}
              />
              <div className="h-4 rounded animate-pulse mb-2" style={{ background: "var(--sidebar-border)" }} />
              <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: "var(--sidebar-border)" }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <section
      className={["rounded-2xl border p-5 sm:p-8", className].filter(Boolean).join(" ")}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
      aria-labelledby="product-recommendations-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 mb-6">
        <div className="min-w-0">
          <h2
            id="product-recommendations-heading"
            className="text-xl sm:text-2xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="text-sm sm:text-base mt-1.5 max-w-xl leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <Link
          href="/shop/"
          className="inline-flex items-center gap-1 shrink-0 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md py-2"
          style={{ color: "var(--accent)" }}
        >
          View full shop
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-5 md:overflow-visible md:snap-none">
        {products.map((product) => {
          const urls = collectProductImageUrls(product as ProductDetail);
          const mainImage = urls[0] ?? null;
          const price = priceLabel(product.price);
          const out = isOutOfStock(product);

          return (
            <article
              key={product.id}
              className="group flex w-[42vw] max-w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 md:max-w-none md:w-auto focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--card-bg)]"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <Link href={`/product/${product.id}/`} className="block shrink-0 outline-none">
                <div
                  className="relative aspect-[4/3] w-full bg-[var(--sidebar-bg)]"
                  style={{ borderBottom: "1px solid var(--sidebar-border)" }}
                >
                  {mainImage ? (
                    <Image
                      src={mainImage}
                      alt={product.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      sizes="(max-width: 768px) 42vw, (max-width: 1024px) 30vw, 16vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3">
                      <Package className="h-9 w-9 opacity-30" style={{ color: "var(--muted-foreground)" }} aria-hidden />
                      <span className="text-[10px] font-medium text-center" style={{ color: "var(--muted-foreground)" }}>
                        Photo soon
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3.5 pt-3">
                  <h3
                    className="text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5rem]"
                    style={{ color: "var(--foreground)" }}
                  >
                    {product.name}
                  </h3>
                  <p className="text-lg font-bold tabular-nums mt-2" style={{ color: "var(--primary)" }}>
                    {price ?? "See details"}
                  </p>
                </div>
              </Link>

              <div className="mt-auto flex flex-col gap-2 p-3 pt-0">
                {showQuickAdd && (
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    disabled={out}
                    onClick={() => handleAddToCart(product.id)}
                    icon={<ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />}
                  >
                    {out ? "Unavailable" : "Add to basket"}
                  </Button>
                )}
                {showWishlist && user && (
                  <button
                    type="button"
                    onClick={() => handleWishlistClick(product.id)}
                    className="text-xs font-medium underline-offset-2 hover:underline py-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {isInWishlist(product.id) ? "Remove from wishlist" : "Save to wishlist"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default React.memo(ProductRecommendations);

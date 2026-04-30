"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import HomeProductCard from "./HomeProductCard";
import { scopeProductsQueryString } from "@/utils/catalogScope";

// ─────────────────────────────────────────────────────────────────
// NOTE FOR FUTURE DEVELOPMENT:
// This section currently displays a limited selection of products
// sorted by name. When the backend exposes one or more of the fields
// below, update the `buildApiUrl` function accordingly:
//
//   - `sort=sales_count` / `order_count` → Most sold products
//   - `is_featured=true`                → Editorially featured
//   - `sort=created_at_desc`             → Newest arrivals
//   - `rating=desc`                      → Top rated
//   - `review_count`                     → Most reviewed
//
// These fields should be exposed by the Django products API.
// ─────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  primary_image?: string | null;
  categories?: string[];
  stock_quantity?: number;
}

interface PaginatedResponse {
  results: Product[];
  count: number;
}

interface ProductPreviewSectionProps {
  title: string;
  subtitle?: string;
  /** Sort query param sent to /api/products/. Default "name_asc". */
  sort?: string;
  limit?: number;
  /** Background style: "default" = var(--background), "subtle" = var(--sidebar-bg) */
  background?: "default" | "subtle";
  className?: string;
}

export default function ProductPreviewSection({
  title,
  subtitle,
  sort = "name_asc",
  limit = 8,
  background = "default",
  className = "",
}: ProductPreviewSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Future: replace sort param once backend exposes sales_count, is_featured, etc.
    const qs = scopeProductsQueryString(
      new URLSearchParams({
        limit: String(limit),
        offset: "0",
        sort,
      }).toString()
    );
    fetch(`/api/products/?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: PaginatedResponse | Product[]) => {
        const results = Array.isArray(data) ? data : data.results ?? [];
        setProducts(results.slice(0, limit));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [limit, sort]);

  const bg =
    background === "subtle" ? "var(--sidebar-bg)" : "var(--background)";

  return (
    <section
      className={`py-16 md:py-20 ${className}`}
      style={{
        background: bg,
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: "var(--accent)" }}
            >
              {subtitle}
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            See all
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: limit > 8 ? 8 : limit }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse"
                style={{
                  height: "260px",
                  background: "var(--card-bg)",
                  border: "1px solid var(--sidebar-border)",
                }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="text-center py-12">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "var(--sidebar-bg)" }}
            >
              <Package
                className="w-7 h-7"
                style={{ color: "var(--muted-foreground)" }}
              />
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Products unavailable right now.{" "}
              <Link href="/shop" className="underline" style={{ color: "var(--accent)" }}>
                Browse the shop
              </Link>
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && products.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No products available yet.{" "}
              <Link href="/shop" className="underline" style={{ color: "var(--accent)" }}>
                Check the full shop
              </Link>
            </p>
          </div>
        )}

        {/* Product grid */}
        {!loading && !error && products.length > 0 && (
          <>
            {/* Mobile: horizontal scroll; desktop: grid */}
            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-2">
              <div className="flex gap-4 lg:grid lg:grid-cols-4 w-max lg:w-auto">
                {products.map((product) => (
                  <HomeProductCard
                    key={product.id}
                    product={product}
                    className="flex-shrink-0 w-44 sm:w-52 lg:w-auto"
                  />
                ))}
              </div>
            </div>

            {/* Mobile "see all" */}
            <div className="mt-6 text-center sm:hidden">
              <Link
                href="/shop"
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--accent)" }}
              >
                See all products
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

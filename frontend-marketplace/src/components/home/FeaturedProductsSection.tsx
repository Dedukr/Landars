"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Package, ChevronRight } from "lucide-react";
import { scopeProductsQueryString } from "@/utils/catalogScope";

// ─────────────────────────────────────────────────────────────────
// Future: When backend adds `is_featured=true` or `created_at`,
// update the fetch URL to ?is_featured=true or ?sort=created_at_desc
// to power genuine "Featured" or "New Arrivals" sections.
// Current behaviour: shows 4 products from a different slice to
// complement the "Popular Picks" section above.
// Backend fields needed: is_featured (boolean), created_at (datetime)
// ─────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  primary_image?: string | null;
  image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  categories?: string[];
}

function getProductImage(p: Product): string | null {
  if (p.primary_image) return p.primary_image;
  if (p.image_url) return p.image_url;
  if (p.images && p.images.length > 0) {
    const first = p.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "image_url" in first) return first.image_url;
  }
  return null;
}

interface FeaturedProductsProps {
  /** Title shown in section header */
  title?: string;
  subtitle?: string;
  /** API sort param. Currently uses price_asc as a safe placeholder. */
  sort?: string;
  limit?: number;
}

export default function FeaturedProductsSection({
  title = "Fresh picks",
  subtitle = "More to explore",
  sort = "price_asc",
  limit = 4,
}: FeaturedProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Fetch with a different sort to complement "Popular Picks"
    // Future: replace with ?is_featured=true when available
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
      .then((data) => {
        const results = Array.isArray(data) ? data : data.results ?? [];
        setProducts(results.slice(0, limit));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [limit, sort]);

  // Hide section entirely if there's an error or no products (don't show empty shells)
  if (!loading && (error || products.length === 0)) return null;

  return (
    <section
      className="py-16 md:py-20"
      style={{
        background: "var(--background)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
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

        {/* Loading skeleton — 2-column editorial grid */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {Array.from({ length: limit }).map((_, i) => (
              <div
                key={i}
                className="flex gap-4 p-4 rounded-2xl animate-pulse border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                }}
              >
                <div
                  className="w-24 h-24 rounded-xl flex-shrink-0"
                  style={{ background: "var(--sidebar-bg)" }}
                />
                <div className="flex-1 space-y-2 py-1">
                  <div
                    className="h-4 rounded w-3/4"
                    style={{ background: "var(--sidebar-bg)" }}
                  />
                  <div
                    className="h-3 rounded w-1/2"
                    style={{ background: "var(--sidebar-bg)" }}
                  />
                  <div
                    className="h-4 rounded w-1/4 mt-2"
                    style={{ background: "var(--sidebar-bg)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Products — editorial 2-column card layout */}
        {!loading && products.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {products.map((product) => {
                const imgUrl = getProductImage(product);
                const price = product.price
                  ? `£${parseFloat(product.price).toFixed(2)}`
                  : null;
                const desc = product.description
                  ? product.description.length > 80
                    ? product.description.slice(0, 80) + "…"
                    : product.description
                  : null;

                return (
                  <Link
                    key={product.id}
                    href={`/product/${product.id}`}
                    className="group flex gap-4 p-4 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                    style={{
                      background: "var(--card-bg)",
                      borderColor: "var(--sidebar-border)",
                      boxShadow: "var(--card-shadow)",
                    }}
                  >
                    {/* Image */}
                    <div
                      className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: "var(--sidebar-bg)" }}
                    >
                      {imgUrl ? (
                        <Image
                          src={imgUrl}
                          alt={product.name}
                          fill
                          sizes="96px"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package
                            className="w-8 h-8 opacity-30"
                            style={{ color: "var(--muted-foreground)" }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-col flex-1 min-w-0">
                      {/* Category */}
                      {product.categories && product.categories.length > 0 && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                          style={{ color: "var(--accent)" }}
                        >
                          {product.categories[0]}
                        </span>
                      )}

                      {/* Name */}
                      <h3
                        className="text-sm font-semibold leading-tight mb-1 line-clamp-2"
                        style={{ color: "var(--foreground)" }}
                      >
                        {product.name}
                      </h3>

                      {/* Description */}
                      {desc && (
                        <p
                          className="text-xs leading-relaxed flex-1 line-clamp-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {desc}
                        </p>
                      )}

                      {/* Price + View */}
                      <div className="flex items-center justify-between mt-auto pt-2">
                        {price && (
                          <span
                            className="text-base font-bold"
                            style={{ color: "var(--primary)" }}
                          >
                            {price}
                          </span>
                        )}
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium transition-opacity group-hover:opacity-70"
                          style={{ color: "var(--accent)" }}
                        >
                          View
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Mobile see-all */}
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

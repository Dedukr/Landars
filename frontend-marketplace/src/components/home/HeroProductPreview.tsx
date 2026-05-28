"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, ArrowRight } from "lucide-react";
import { scopeProductsQueryString } from "@/utils/catalogScope";

interface Product {
  id: number;
  name: string;
  price: string;
  primary_image?: string | null;
  image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  categories?: string[];
}

const HERO_PREVIEW_POOL_SIZE = 24;
const HERO_PREVIEW_COUNT = 3;

function pickRandomItems<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function getProductImage(p: Product): string | null {
  if (p.primary_image) return p.primary_image;
  if (p.image_url) return p.image_url;
  if (p.images && p.images.length > 0) {
    const first = p.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "image_url" in first)
      return first.image_url;
  }
  return null;
}

export default function HeroProductPreview() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const qs = scopeProductsQueryString(
      `limit=${HERO_PREVIEW_POOL_SIZE}&sort=created_at_desc`
    );
    fetch(`/api/products/?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data) => {
        const results = Array.isArray(data) ? data : data.results ?? [];
        setProducts(pickRandomItems(results, HERO_PREVIEW_COUNT));
        setLoaded(true);
      })
      .catch(() => {
        /* silently hide — hero still renders without product cards */
        setLoaded(true);
      });
  }, []);

  // Don't render anything until we know the fetch result
  if (!loaded || products.length === 0) return null;

  return (
    <div className="hidden lg:flex flex-col gap-3 w-64 xl:w-72 flex-shrink-0 animate-fade-in-up mt-6 xl:mt-10">
      {/* Header label */}
      <div className="flex items-center justify-between mb-1 px-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          From our range
        </span>
        <Link
          href="/shop"
          className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          See all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {products.map((product, idx) => {
        const imgUrl = getProductImage(product);
        return (
          <Link
            key={product.id}
            href={`/product/${product.id}`}
            className="group flex items-center gap-3 p-3 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--sidebar-border)",
              boxShadow: "var(--card-shadow)",
              animationDelay: `${idx * 80}ms`,
            }}
          >
            {/* Product image */}
            <div
              className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
              style={{ background: "var(--sidebar-bg)" }}
            >
              {imgUrl ? (
                <Image
                  src={imgUrl}
                  alt={product.name}
                  fill
                  sizes="56px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package
                    className="w-6 h-6 opacity-30"
                    style={{ color: "var(--muted-foreground)" }}
                  />
                </div>
              )}
            </div>

            {/* Product info */}
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-semibold leading-tight line-clamp-2 mb-1"
                style={{ color: "var(--foreground)" }}
              >
                {product.name}
              </p>
              {product.categories && product.categories.length > 0 && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "var(--sidebar-bg)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  {product.categories[0]}
                </span>
              )}
            </div>

            {/* Price */}
            <span
              className="text-sm font-bold flex-shrink-0"
              style={{ color: "var(--accent)" }}
            >
              £{parseFloat(product.price).toFixed(2)}
            </span>
          </Link>
        );
      })}

      {/* View all link */}
      <Link
        href="/shop"
        className="flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-semibold border transition-all duration-200 hover:opacity-80 mt-1"
        style={{
          borderColor: "var(--sidebar-border)",
          color: "var(--foreground)",
          background: "transparent",
          borderStyle: "dashed",
        }}
      >
        Browse all products
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Utensils,
  Beef,
  Soup,
  Cookie,
  ChevronRight,
} from "lucide-react";
import {
  resolveShopFeaturedCategories,
  shopFeaturedCategoryFallbacks,
} from "@/constants/shopCategoryChips";

interface Category {
  id: number;
  name: string;
  parent: number | null;
  // Optional fields the backend may expose in the future:
  image_url?: string | null;       // Category cover image
  products_count?: number | null;  // Number of products in this category
}

function getCategoryIcon(name: string): React.ElementType {
  const lc = name.toLowerCase();
  if (lc.includes("dumpling") || lc.includes("varenyky")) return Cookie;
  if (lc.includes("lard")) return Utensils;
  if (lc.includes("meat snack") || lc.includes("snack")) return Beef;
  if (lc.includes("soup")) return Soup;
  return Utensils;
}

interface CategoryCardProps {
  category: Category;
}

function CategoryCard({ category }: CategoryCardProps) {
  const Icon = getCategoryIcon(category.name);
  // Link to /shop for static fallback, or /shop?category=id for real categories
  const href = category.id > 0 ? `/shop?category=${category.id}` : "/shop";

  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Category image (if backend provides one) or icon fallback */}
      <div
        className="relative w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center transition-colors duration-200"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={category.name}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <Icon
            className="w-7 h-7 transition-colors duration-200"
            style={{ color: "var(--accent)" }}
          />
        )}
      </div>

      <div className="text-center">
        <span
          className="text-sm font-semibold leading-tight block"
          style={{ color: "var(--foreground)" }}
        >
          {category.name}
        </span>
        {/* Product count badge — shown only when backend returns products_count */}
        {typeof category.products_count === "number" && category.products_count > 0 && (
          <span
            className="text-[10px] font-medium mt-1 inline-block"
            style={{ color: "var(--muted-foreground)" }}
          >
            {category.products_count} item{category.products_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function CategoryGrid() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories/")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch categories");
        return r.json();
      })
      .then((data: Category[]) => {
        const list = Array.isArray(data) ? data : [];
        const featured = resolveShopFeaturedCategories(list);
        setCategories(
          featured.length > 0 ? featured : shopFeaturedCategoryFallbacks()
        );
      })
      .catch(() => {
        setCategories(shopFeaturedCategoryFallbacks());
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section
      className="py-16 md:py-20"
      style={{
        background: "var(--sidebar-bg)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: "var(--accent)" }}
            >
              Browse
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              Shop by category
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            See all products
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Category grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl animate-pulse"
                style={{ background: "var(--card-bg)" }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        )}

        {/* Mobile "see all" link */}
        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            See all products
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

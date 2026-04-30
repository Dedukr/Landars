"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Utensils,
  Beef,
  Milk,
  Wheat,
  Apple,
  Fish,
  Coffee,
  Cookie,
  ShoppingBasket,
  Wine,
  Carrot,
  ChevronRight,
} from "lucide-react";

interface Category {
  id: number;
  name: string;
  parent: number | null;
  // Optional fields the backend may expose in the future:
  image_url?: string | null;       // Category cover image
  products_count?: number | null;  // Number of products in this category
}

// Map common Eastern European food category names to lucide icons
function getCategoryIcon(name: string): React.ElementType {
  const lc = name.toLowerCase();
  if (lc.includes("sausage") || lc.includes("meat") || lc.includes("pork") || lc.includes("beef")) return Beef;
  if (lc.includes("dairy") || lc.includes("milk") || lc.includes("cheese") || lc.includes("cream")) return Milk;
  if (lc.includes("bread") || lc.includes("bakery") || lc.includes("pastry") || lc.includes("wheat")) return Wheat;
  if (lc.includes("fruit") || lc.includes("apple") || lc.includes("jam") || lc.includes("preserve")) return Apple;
  if (lc.includes("fish") || lc.includes("seafood")) return Fish;
  if (lc.includes("drink") || lc.includes("beverage") || lc.includes("juice") || lc.includes("tea") || lc.includes("coffee")) return Coffee;
  if (lc.includes("cookie") || lc.includes("sweet") || lc.includes("candy") || lc.includes("biscuit") || lc.includes("dessert")) return Cookie;
  if (lc.includes("wine") || lc.includes("alcohol") || lc.includes("beer") || lc.includes("spirit")) return Wine;
  if (lc.includes("vegetable") || lc.includes("pickle") || lc.includes("ferment") || lc.includes("carrot")) return Carrot;
  if (lc.includes("fish") || lc.includes("herring")) return Fish;
  return Utensils;
}

// Static fallback categories to show if API returns nothing
const STATIC_FALLBACK_CATEGORIES: Array<{ id: number; name: string; parent: null }> = [
  { id: -1, name: "Sausages & Meats", parent: null },
  { id: -2, name: "Dairy Products", parent: null },
  { id: -3, name: "Bread & Pastries", parent: null },
  { id: -4, name: "Pickles & Preserves", parent: null },
];

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
        // Show only root categories (parent === null) on the homepage
        const roots = data.filter((c) => c.parent === null);
        setCategories(roots.length > 0 ? roots : STATIC_FALLBACK_CATEGORIES);
      })
      .catch(() => {
        // Use static fallback if API is unavailable
        setCategories(STATIC_FALLBACK_CATEGORIES);
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl animate-pulse"
                style={{ background: "var(--card-bg)" }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
            {/* "All products" catch-all card */}
            <Link
              href="/shop"
              className="group flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              style={{
                background: "var(--background)",
                borderColor: "var(--sidebar-border)",
                borderStyle: "dashed",
              }}
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: "var(--sidebar-bg)" }}
              >
                <ShoppingBasket
                  className="w-7 h-7"
                  style={{ color: "var(--muted-foreground)" }}
                />
              </div>
              <span
                className="text-sm font-semibold text-center"
                style={{ color: "var(--muted-foreground)" }}
              >
                View all
              </span>
            </Link>
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

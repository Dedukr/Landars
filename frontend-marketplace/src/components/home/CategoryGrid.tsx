"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CategoryCarousel from "@/components/categories/CategoryCarousel";
import {
  prepareHomeDisplayCategories,
  type ApiCategory,
  type HomeDisplayCategory,
} from "@/lib/prepareHomeDisplayCategories";

export default function CategoryGrid() {
  const [categories, setCategories] = useState<HomeDisplayCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories/")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch categories");
        return r.json();
      })
      .then((data: ApiCategory[] | { results?: ApiCategory[] }) => {
        const list = Array.isArray(data) ? data : data.results ?? [];
        setCategories(prepareHomeDisplayCategories(list));
      })
      .catch(() => setCategories([]))
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
        <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
          <div>
            <p
              className="mb-1 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--accent)" }}
            >
              Browse
            </p>
            <h2
              className="text-3xl font-bold sm:text-4xl"
              style={{ color: "var(--foreground)" }}
            >
              Shop by category
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70 sm:inline-flex"
            style={{ color: "var(--accent)" }}
          >
            See all products
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <CategoryCarousel
          categories={categories}
          loading={loading}
          mode="link"
          panelTone="card"
          ariaLabel="Shop by category"
        />
      </div>
    </section>
  );
}
